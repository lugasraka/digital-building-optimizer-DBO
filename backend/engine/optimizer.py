from dataclasses import dataclass

import numpy as np
import scipy.sparse as sp
from scipy.optimize import linprog

from engine.data import Tariff

MMBTUH_TO_KW = 293.071


@dataclass(frozen=True)
class Sizing:
    pv_kw: float = 0.0
    bess_kwh: float = 0.0
    bess_kw: float = 0.0
    hp_fraction: float = 0.0


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
