from dataclasses import dataclass

import numpy as np
import scipy.sparse as sp
from scipy.optimize import linprog

from engine.baseline import BaselineResult, compute_baseline
from engine.data import DataRepo, Tariff, get_repo
from engine.errors import InfeasibleTarget
from engine.models import BaselineRequest, ObjectiveMode, OptimizeRequest
from engine.solar import pv_power_kw

MMBTUH_TO_KW = 293.071


@dataclass(frozen=True)
class Sizing:
    pv_kw: float = 0.0
    bess_kwh: float = 0.0
    bess_kw: float = 0.0
    hp_fraction: float = 0.0


from engine import finance as fin  # noqa: E402  (after Sizing to avoid circular import)


@dataclass(frozen=True)
class LPParams:
    charge_eff: float = 0.95
    discharge_eff: float = 0.95
    unmet_penalty_usd_per_kwh: float = 10_000.0
    export_credit_frac: float = 0.5


@dataclass(frozen=True)
class DispatchResult:
    import_kw: np.ndarray
    export_kw: np.ndarray
    charge_kw: np.ndarray
    discharge_kw: np.ndarray
    soc_kwh: np.ndarray
    unmet_kw: np.ndarray
    hp_elec_kw: np.ndarray
    hp_thermal_mmbtu_h: np.ndarray
    gas_after_mmbtu: np.ndarray
    peak_kw: float
    annual_cost_usd: float
    co2_tco2e: float


def cop_curve(temps_c: np.ndarray) -> np.ndarray:
    """Air-source HP COP: 3.5 above 10degC, linear derate to floor 1.8."""
    cop = np.where(temps_c < 10.0, 3.5 - 0.08 * (10.0 - temps_c), 3.5)
    return np.clip(cop, 1.8, 3.5)


def dispatch_lp(load_kw, gas_mmbtu_h, temps_c, tariff, pv_per_kw, sizing,
                params=None) -> DispatchResult:
    p = params or LPParams()
    n = len(load_kw)
    pv_avail = np.zeros(n) if pv_per_kw is None else pv_per_kw * sizing.pv_kw

    cop = cop_curve(temps_c)
    hp_cap = sizing.hp_fraction * float(gas_mmbtu_h.max()) if n else 0.0
    ub_hp = (np.minimum(hp_cap, gas_mmbtu_h) / cop) * MMBTUH_TO_KW if hp_cap > 0 \
        else np.zeros(n)

    # variable order per hour: imp exp ch dis u soc hp ; trailing scalar P
    nv = 7 * n + 1
    c = np.zeros(nv)
    c[0:n] = tariff.elec_usd_kwh                       # imp
    c[n:2 * n] = -tariff.elec_usd_kwh * p.export_credit_frac   # exp
    c[4 * n:5 * n] = p.unmet_penalty_usd_per_kwh       # u
    c[-1] = tariff.demand_usd_kw_month * 12.0          # P

    # bounds
    lb = np.zeros(nv)
    ub = np.full(nv, np.inf)
    ub[n:2 * n] = np.inf                                # export uncapped
    ub[2 * n:3 * n] = sizing.bess_kw                    # ch
    ub[3 * n:4 * n] = sizing.bess_kw                    # dis
    ub[5 * n:6 * n] = sizing.bess_kwh                   # soc
    ub[6 * n:7 * n] = ub_hp                             # hp elec
    bounds = list(zip(lb, ub))

    er, ec, ev, beq = [], [], [], []

    def put(row, col, val):
        er.append(row); ec.append(col); ev.append(val)

    for t in range(n):                                   # energy balance
        row = t
        put(row, 0 * n + t, 1.0)      # imp
        put(row, 1 * n + t, -1.0)     # exp
        put(row, 2 * n + t, -1.0)     # ch
        put(row, 3 * n + t, 1.0)      # dis
        put(row, 4 * n + t, 1.0)      # unmet
        put(row, 6 * n + t, 1.0)      # hp elec
        beq.append(float(load_kw[t] - pv_avail[t]))
    soc_base = 5 * n
    for t in range(n):                                   # battery dynamics
        row = n + t
        put(row, soc_base + t, 1.0)
        if t > 0:
            put(row, soc_base + t - 1, -1.0)
        put(row, 2 * n + t, -p.charge_eff)
        put(row, 3 * n + t, 1.0 / p.discharge_eff)
        beq.append(0.0)
    put(2 * n, soc_base + n - 1, 1.0); beq.append(0.0)   # end empty
    put(2 * n + 1, soc_base, 1.0); beq.append(0.0)       # start empty

    ur, uc, uv, bub = [], [], [], []
    for t in range(n):                                   # P >= imp_t
        ur += [t, t]; uc += [7 * n, t]; uv += [-1.0, 1.0]
        bub.append(0.0)

    res = linprog(
        c,
        A_ub=sp.csr_matrix((uv, (ur, uc)), shape=(n, nv)),
        b_ub=np.array(bub),
        A_eq=sp.csr_matrix((ev, (er, ec)), shape=(2 * n + 2, nv)),
        b_eq=np.array(beq),
        bounds=bounds,
        method="highs",
    )
    if not res.success:  # pragma: no cover - slack guarantees feasibility
        raise RuntimeError(f"dispatch LP failed: {res.message}")

    x = res.x
    imp, exp_ = x[0:n], x[n:2 * n]
    ch, dis = x[2 * n:3 * n], x[3 * n:4 * n]
    unmet, soc = x[4 * n:5 * n], x[soc_base:6 * n]
    hp_elec = x[6 * n:7 * n]
    hp_th = hp_elec / MMBTUH_TO_KW * cop
    gas_after = np.clip(gas_mmbtu_h - hp_th, 0.0, None)
    peak = float(x[-1])
    cost = float(res.fun)  # excludes nothing; includes all priced terms
    co2 = (imp.sum() / 1000.0 * tariff.co2e_kg_per_mwh / 1000.0
           + gas_after.sum() * 53.06 / 1000.0)

    return DispatchResult(
        import_kw=imp, export_kw=exp_, charge_kw=ch, discharge_kw=dis,
        soc_kwh=soc, unmet_kw=unmet, hp_elec_kw=hp_elec,
        hp_thermal_mmbtu_h=hp_th, gas_after_mmbtu=gas_after,
        peak_kw=peak, annual_cost_usd=cost, co2_tco2e=float(co2),
    )


PV_PACKING_KW_PER_SQFT = 0.010


def roof_pv_max_kw(floor_area_sqft: float) -> float:
    return floor_area_sqft * PV_PACKING_KW_PER_SQFT


def pv_curve_per_kw(ghi_wm2, temp_c, lat):
    return pv_power_kw(1.0, ghi_wm2, temp_c, lat)


def total_energy_cost(d: DispatchResult, tariff: Tariff) -> float:
    return float(d.annual_cost_usd
                 + d.gas_after_mmbtu.sum() * 10.0 * tariff.gas_usd_therm)


def _combos(toggles) -> list[tuple[float, float, float]]:
    pvs = [0.0, 0.5, 1.0] if toggles.pv else [0.0]
    durs = [0.0, 4.0] if toggles.bess else [0.0]
    hps = [0.0, 0.9] if toggles.heat_pump else [0.0]
    out = []
    for pf in pvs:
        for dur in durs:
            for hf in hps:
                if pf == 0.0 and dur == 0.0 and hf == 0.0:
                    continue  # zero combo appended once at the end
                out.append((pf, dur, hf))
    out.insert(0, (0.0, 0.0, 0.0))
    return out


@dataclass(frozen=True)
class OptimizeResult:
    baseline: BaselineResult
    best_sizing: Sizing | None
    best_dispatch: DispatchResult
    best_financials: object | None
    evaluation_log: list[dict]
    target_met: bool | None


def search_optimal(req: OptimizeRequest, repo: DataRepo | None = None) -> OptimizeResult:
    repo = repo or get_repo()
    base = compute_baseline(
        BaselineRequest(**req.facility.model_dump()), repo)
    loc, tariff = base.location, base.tariff
    tmy = repo.tmy(loc.station_id)
    temps = tmy["temp_c"].to_numpy()
    ghi = tmy["ghi_wm2"].to_numpy()
    curve = pv_curve_per_kw(ghi, temps, repo.station_lat(loc.station_id))

    base_cost = (base.spend_electricity_usd + base.spend_demand_usd
                 + base.spend_gas_usd)
    base_co2 = base.scope1_tco2e + base.scope2_tco2e
    peak_bess_kw = 0.3 * base.peak_kw
    roof_max = roof_pv_max_kw(req.facility.floor_area_sqft)

    log: list[dict] = []
    results: list[tuple[Sizing, DispatchResult]] = []
    fins: list = []
    for pv_frac, dur, hf in _combos(req.scenario.assets):
        s = Sizing(pv_kw=pv_frac * roof_max,
                   bess_kwh=dur * peak_bess_kw,
                   bess_kw=peak_bess_kw if dur > 0 else 0.0,
                   hp_fraction=hf)
        d = dispatch_lp(base.hourly_electric_kw,
                        base.hourly_gas_mmbtu_per_hour,
                        temps, tariff,
                        curve if s.pv_kw > 0 else None, s)
        cost = total_energy_cost(d, tariff)
        yr1 = base_cost - cost
        red = (1 - d.co2_tco2e / base_co2) * 100 if base_co2 > 0 else 0.0
        pv_share = 0.0 if yr1 <= 0 else min(max(
            (base.spend_electricity_usd + base.spend_demand_usd
             - d.annual_cost_usd) / yr1, 0.0), 1.0)
        f = fin.build_financial_summary(s, yr1, pv_share,
                                        peak_thermal_mmbtu_h=float(
                                            base.hourly_gas_mmbtu_per_hour.max()))
        npv_v = f.npv_usd if yr1 > 0 else 0.0
        log.append({"pv_kw": round(s.pv_kw, 1), "bess_kwh": round(s.bess_kwh, 1),
                    "hp_fraction": hf, "total_cost_usd": round(cost, 2),
                    "yr1_savings_usd": round(yr1, 2),
                    "co2_reduction_pct": round(red, 2),
                    "npv_usd": round(npv_v, 2)})
        results.append((s, d))
        fins.append(f)

    mode = req.scenario.objective
    target_met = None
    if mode == ObjectiveMode.TARGET_CO2:
        tgt = req.scenario.co2_reduction_target_pct
        feas = [(i, row) for i, row in enumerate(log) if row["co2_reduction_pct"] >= tgt]
        if not feas:
            raise InfeasibleTarget(
                f"target {tgt}% CO2 reduction not achievable with available assets")
        best_i = max(feas, key=lambda kv: kv[1]["npv_usd"])[0]
        target_met = True
    else:
        best_npv_row = max(range(len(log)), key=lambda i: log[i]["npv_usd"])
        best_i = best_npv_row if log[best_npv_row]["npv_usd"] > 0 else 0
    s, d = results[best_i]
    none_best = all(v == 0.0 for v in (s.pv_kw, s.bess_kwh, s.hp_fraction))
    return OptimizeResult(baseline=base,
                          best_sizing=None if none_best else s,
                          best_dispatch=d,
                          best_financials=None if none_best else fins[best_i],
                          evaluation_log=log,
                          target_met=target_met)
