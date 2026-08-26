from enum import Enum

from pydantic import BaseModel, Field


class BuildingType(str, Enum):
    OFFICE = "office"
    RETAIL = "retail_standalone"
    WAREHOUSE = "warehouse"
    SCHOOL = "k12_school"
    HOSPITAL = "hospital"
    HOTEL = "hotel"


class Vintage(str, Enum):
    PRE1980 = "pre1980"
    MID = "1980_2004"
    POST2004 = "post2004"


class ObjectiveMode(str, Enum):
    MAX_NPV = "max_npv"
    TARGET_CO2 = "target_co2"


class FacilityInput(BaseModel):
    zip_code: str = Field(pattern=r"^\d{5}$")
    building_type: BuildingType
    floor_area_sqft: float = Field(gt=500, le=5_000_000)
    vintage: Vintage | None = None


class MonthlyPoint(BaseModel):
    month: int
    electricity_kwh: float
    gas_mmbtu: float


class SpendBreakdown(BaseModel):
    electricity_usd: float
    demand_charges_usd: float
    gas_usd: float
    total_usd: float


class BaselineRequest(FacilityInput):
    pass


class BaselineResponse(BaseModel):
    zip_code: str
    county_fips: str
    county_name: str
    state: str
    climate_zone_group: str
    tmy_station_id: str
    annual_electricity_kwh: float
    annual_gas_mmbtu: float
    scope1_tco2e: float
    scope2_tco2e: float
    total_tco2e: float
    peak_kw: float
    spend: SpendBreakdown
    monthly: list[MonthlyPoint]
    hourly_electric_kw: list[float]
    hourly_gas_mmbtu_per_hour: list[float]
    data_provenance: str


class AssetToggles(BaseModel):
    pv: bool = True
    bess: bool = True
    heat_pump: bool = True


class ScenarioConfig(BaseModel):
    objective: ObjectiveMode = ObjectiveMode.MAX_NPV
    co2_reduction_target_pct: float | None = Field(default=None, ge=1, le=100)
    assets: AssetToggles = AssetToggles()


class OptimizeRequest(BaseModel):
    facility: FacilityInput
    scenario: ScenarioConfig


class AssetSizing(BaseModel):
    pv_kw: float
    bess_kwh: float
    bess_kw: float
    hp_fraction: float
    hp_capacity_tons: float


class DispatchSummary(BaseModel):
    annual_import_kwh: float
    annual_export_kwh: float
    annual_gas_mmbtu_after: float
    unmet_hours: int
    peak_kw_after: float


class YearlyEmissions(BaseModel):
    year: int
    scope1_tco2e: float
    scope2_tco2e: float


class FinancialSummary(BaseModel):
    capex_gross_usd: float
    incentives_usd: float
    capex_net_usd: float
    annual_savings_yr1_usd: float
    npv_usd: float
    irr: float | None
    simple_payback_years: float | None
    eaas_annual_fee_yr1_usd: float
    eaas_npv_customer_benefit_usd: float
    capex_cashflow: list[float]
    eaas_net_cashflow: list[float]


class OptimizeResponse(BaseModel):
    county_name: str
    state: str
    climate_zone_group: str
    objective_mode: ObjectiveMode
    baseline_total_cost_usd: float
    baseline_scope1_tco2e: float
    baseline_scope2_tco2e: float
    baseline_total_tco2e: float
    sizing: AssetSizing | None
    dispatch: DispatchSummary
    hourly_import_kw: list[float]
    hourly_export_kw: list[float]
    hourly_bess_soc_kwh: list[float]
    financials: FinancialSummary | None
    emissions_trajectory: list[YearlyEmissions]
    target_met: bool | None
    evaluation_log: list[dict]


class ResilienceRequest(BaseModel):
    zip_code: str = Field(pattern=r"^\d{5}$")
    building_type: BuildingType
    portfolio: AssetToggles = AssetToggles()


class HazardScore(BaseModel):
    hazard: str
    before: float
    after: float
    mitigations: list[str]


class ResilienceResponse(BaseModel):
    county_fips: str
    county_name: str
    state: str
    overall_before: float
    overall_after: float
    hazards: list[HazardScore]
