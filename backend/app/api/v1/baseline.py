from fastapi import APIRouter, Depends

from app.deps import get_repo_dep
from engine.baseline import PROVENANCE, compute_baseline, monthly_totals
from engine.data import DataRepo
from engine.models import BaselineRequest, BaselineResponse, MonthlyPoint, SpendBreakdown

router = APIRouter()


@router.post("/baseline", response_model=BaselineResponse)
def baseline(req: BaselineRequest,
             repo: DataRepo = Depends(get_repo_dep)) -> BaselineResponse:
    r = compute_baseline(req, repo)
    loc = r.location
    return BaselineResponse(
        zip_code=req.zip_code,
        county_fips=loc.county_fips,
        county_name=loc.county_name,
        state=loc.state,
        climate_zone_group=loc.zone_group,
        tmy_station_id=loc.station_id,
        annual_electricity_kwh=r.annual_electricity_kwh,
        annual_gas_mmbtu=r.annual_gas_mmbtu,
        scope1_tco2e=r.scope1_tco2e,
        scope2_tco2e=r.scope2_tco2e,
        total_tco2e=r.scope1_tco2e + r.scope2_tco2e,
        peak_kw=r.peak_kw,
        spend=SpendBreakdown(
            electricity_usd=r.spend_electricity_usd,
            demand_charges_usd=r.spend_demand_usd,
            gas_usd=r.spend_gas_usd,
            total_usd=r.spend_electricity_usd + r.spend_demand_usd + r.spend_gas_usd,
        ),
        monthly=[
            MonthlyPoint(month=m + 1,
                         electricity_kwh=kwh,
                         gas_mmbtu=gas)
            for m, (kwh, gas) in enumerate(zip(
                monthly_totals(r.hourly_electric_kw),
                monthly_totals(r.hourly_gas_mmbtu_per_hour)))
        ],
        hourly_electric_kw=[float(x) for x in r.hourly_electric_kw],
        hourly_gas_mmbtu_per_hour=[float(x) for x in r.hourly_gas_mmbtu_per_hour],
        data_provenance=PROVENANCE,
    )