from dataclasses import dataclass

import numpy as np

from engine.data import Benchmark, DataRepo, Location, Tariff, get_repo
from engine.models import BaselineRequest
from engine.profiles import hour_months, synthesize_electric, synthesize_gas

GAS_KGCO2E_PER_MMBTU = 53.06
THERMS_PER_MMBTU = 10.0
MMBTU_PER_KWH = 0.003412
DEFAULT_VINTAGE = "1980_2004"
PROVENANCE = "representative meteorological year; CBECS-derived benchmarks"


@dataclass(frozen=True)
class BaselineResult:
    location: Location
    tariff: Tariff
    benchmark: Benchmark
    vintage: str
    hourly_electric_kw: np.ndarray
    hourly_gas_mmbtu_per_hour: np.ndarray
    annual_electricity_kwh: float
    annual_gas_mmbtu: float
    peak_kw: float
    scope1_tco2e: float
    scope2_tco2e: float
    spend_electricity_usd: float
    spend_demand_usd: float
    spend_gas_usd: float


def compute_baseline(req: BaselineRequest, repo: DataRepo | None = None) -> BaselineResult:
    repo = repo or get_repo()
    loc = repo.location(req.zip_code)
    tariff = repo.tariff(loc.state)
    vintage = req.vintage.value if req.vintage is not None else DEFAULT_VINTAGE
    bench = repo.benchmark(req.building_type.value, loc.zone_group, vintage)

    annual_elec = bench.elec_kwh_sqft * req.floor_area_sqft
    annual_gas = bench.gas_kwh_sqft * req.floor_area_sqft * MMBTU_PER_KWH

    tmy = repo.tmy(loc.station_id)
    temps = tmy["temp_c"].to_numpy()
    elec = synthesize_electric(bench, annual_elec, temps)
    gas = synthesize_gas(bench, annual_gas, temps)
    peak = float(elec.max())

    scope1 = annual_gas * GAS_KGCO2E_PER_MMBTU / 1000.0
    scope2 = annual_elec / 1000.0 * tariff.co2e_kg_per_mwh / 1000.0

    spend_elec = annual_elec * tariff.elec_usd_kwh
    spend_dc = peak * tariff.demand_usd_kw_month * 12.0
    spend_gas = annual_gas * THERMS_PER_MMBTU * tariff.gas_usd_therm

    return BaselineResult(
        location=loc, tariff=tariff, benchmark=bench, vintage=vintage,
        hourly_electric_kw=elec, hourly_gas_mmbtu_per_hour=gas,
        annual_electricity_kwh=float(annual_elec), annual_gas_mmbtu=float(annual_gas),
        peak_kw=peak, scope1_tco2e=float(scope1), scope2_tco2e=float(scope2),
        spend_electricity_usd=float(spend_elec), spend_demand_usd=float(spend_dc),
        spend_gas_usd=float(spend_gas),
    )


def monthly_totals(hourly: np.ndarray) -> list[float]:
    months = hour_months()
    return [float(hourly[months == m].sum()) for m in range(1, 13)]
