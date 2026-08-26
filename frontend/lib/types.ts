// Contract types mirroring backend/engine/models.py (hand-maintained, no codegen).
// Keep field names and types in sync with the backend — names are contractual.

export type BuildingType =
  | "office"
  | "retail_standalone"
  | "warehouse"
  | "k12_school"
  | "hospital"
  | "hotel";

export type Vintage = "pre1980" | "1980_2004" | "post2004";

export type ObjectiveMode = "max_npv" | "target_co2";

export interface FacilityInput {
  zip_code: string;
  building_type: BuildingType;
  floor_area_sqft: number;
  vintage?: Vintage | null;
}

export type BaselineRequest = FacilityInput;

export interface MonthlyPoint {
  month: number;
  electricity_kwh: number;
  gas_mmbtu: number;
}

export interface SpendBreakdown {
  electricity_usd: number;
  demand_charges_usd: number;
  gas_usd: number;
  total_usd: number;
}

export interface BaselineResponse {
  zip_code: string;
  county_fips: string;
  county_name: string;
  state: string;
  climate_zone_group: string;
  tmy_station_id: string;
  annual_electricity_kwh: number;
  annual_gas_mmbtu: number;
  scope1_tco2e: number;
  scope2_tco2e: number;
  total_tco2e: number;
  peak_kw: number;
  spend: SpendBreakdown;
  monthly: MonthlyPoint[];
  hourly_electric_kw: number[];
  hourly_gas_mmbtu_per_hour: number[];
  data_provenance: string;
}

export interface AssetToggles {
  pv: boolean;
  bess: boolean;
  heat_pump: boolean;
}

export interface ScenarioConfig {
  objective: ObjectiveMode;
  co2_reduction_target_pct?: number | null;
  assets: AssetToggles;
}

export interface OptimizeRequest {
  facility: FacilityInput;
  scenario: ScenarioConfig;
}

export interface AssetSizing {
  pv_kw: number;
  bess_kwh: number;
  bess_kw: number;
  hp_fraction: number;
  hp_capacity_tons: number;
}

export interface DispatchSummary {
  annual_import_kwh: number;
  annual_export_kwh: number;
  annual_gas_mmbtu_after: number;
  unmet_hours: number;
  peak_kw_after: number;
}

export interface YearlyEmissions {
  year: number;
  scope1_tco2e: number;
  scope2_tco2e: number;
}

export interface FinancialSummary {
  capex_gross_usd: number;
  incentives_usd: number;
  capex_net_usd: number;
  annual_savings_yr1_usd: number;
  npv_usd: number;
  irr: number | null;
  simple_payback_years: number | null;
  eaas_annual_fee_yr1_usd: number;
  eaas_npv_customer_benefit_usd: number;
  capex_cashflow: number[];
  eaas_net_cashflow: number[];
}

export interface OptimizeResponse {
  county_name: string;
  state: string;
  climate_zone_group: string;
  objective_mode: ObjectiveMode;
  baseline_total_cost_usd: number;
  baseline_scope1_tco2e: number;
  baseline_scope2_tco2e: number;
  baseline_total_tco2e: number;
  sizing: AssetSizing | null;
  dispatch: DispatchSummary;
  hourly_import_kw: number[];
  hourly_export_kw: number[];
  hourly_bess_soc_kwh: number[];
  financials: FinancialSummary | null;
  emissions_trajectory: YearlyEmissions[];
  target_met: boolean | null;
  evaluation_log: Record<string, number | string | boolean>[];
}

export interface ResilienceRequest {
  zip_code: string;
  building_type: BuildingType;
  portfolio?: AssetToggles;
}

export interface HazardScore {
  hazard: string;
  before: number;
  after: number;
  mitigations: string[];
}

export interface ResilienceResponse {
  county_fips: string;
  county_name: string;
  state: string;
  overall_before: number;
  overall_after: number;
  hazards: HazardScore[];
}

// Reference endpoints (Plan 1 Task 15)
export interface ReferenceBuildingType {
  value: BuildingType;
  label: string;
}

export interface ReferenceDemoZip {
  zip: string;
  label: string;
}

export interface ReferenceAssumptions {
  pv_usd_per_kw: number;
  bess_usd_per_kwh: number;
  hp_usd_per_ton: number;
  itc_rate: number;
  discount_rate: number;
  utility_escalation: number;
  eaas_fee_share: number;
  analysis_years: number;
  gas_kgco2e_per_mmbtu: number;
  provenance: string;
}

// RFC 7807 problem+json
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
}
