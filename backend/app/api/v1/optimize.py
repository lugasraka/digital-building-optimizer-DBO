from fastapi import APIRouter, Depends

from app.deps import get_repo_dep
from engine.data import DataRepo
from engine.models import (
    AssetSizing, DispatchSummary, OptimizeRequest, OptimizeResponse,
    YearlyEmissions,
)
from engine.optimizer import search_optimal

router = APIRouter()

MMBTUH_PER_TON = 0.012


@router.post("/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest,
             repo: DataRepo = Depends(get_repo_dep)) -> OptimizeResponse:
    r = search_optimal(req, repo)
    base = r.baseline
    d = r.best_dispatch

    sizing = None
    if r.best_sizing is not None:
        capex_hp_tons = (r.best_sizing.hp_fraction
                         * float(base.hourly_gas_mmbtu_per_hour.max())
                         / MMBTUH_PER_TON)
        sizing = AssetSizing(
            pv_kw=r.best_sizing.pv_kw,
            bess_kwh=r.best_sizing.bess_kwh,
            bess_kw=r.best_sizing.bess_kw,
            hp_fraction=r.best_sizing.hp_fraction,
            hp_capacity_tons=capex_hp_tons,
        )

    dispatch = DispatchSummary(
        annual_import_kwh=float(d.import_kw.sum()),
        annual_export_kwh=float(d.export_kw.sum()),
        annual_gas_mmbtu_after=float(d.gas_after_mmbtu.sum()),
        unmet_hours=int((d.unmet_kw > 1e-6).sum()),
        peak_kw_after=d.peak_kw,
    )
    hourly_import_kw = [float(x) for x in d.import_kw]
    hourly_export_kw = [float(x) for x in d.export_kw]
    hourly_bess_soc_kwh = [float(x) for x in d.soc_kwh]

    trajectory = []
    scope1_after = float(d.gas_after_mmbtu.sum() * 53.06 / 1000.0)
    scope2_after = float(d.import_kw.sum() / 1000.0 * base.tariff.co2e_kg_per_mwh / 1000.0)
    for year in range(1, 16):
        trajectory.append(YearlyEmissions(year=year,
                                          scope1_tco2e=round(scope1_after, 3),
                                          scope2_tco2e=round(scope2_after, 3)))

    return OptimizeResponse(
        county_name=base.location.county_name,
        state=base.location.state,
        climate_zone_group=base.location.zone_group,
        objective_mode=req.scenario.objective,
        baseline_total_cost_usd=(base.spend_electricity_usd
                                 + base.spend_demand_usd + base.spend_gas_usd),
        baseline_scope1_tco2e=base.scope1_tco2e,
        baseline_scope2_tco2e=base.scope2_tco2e,
        baseline_total_tco2e=base.scope1_tco2e + base.scope2_tco2e,
        sizing=sizing,
        dispatch=dispatch,
        hourly_import_kw=hourly_import_kw,
        hourly_export_kw=hourly_export_kw,
        hourly_bess_soc_kwh=hourly_bess_soc_kwh,
        financials=r.best_financials,
        emissions_trajectory=trajectory,
        target_met=r.target_met,
        evaluation_log=r.evaluation_log,
    )