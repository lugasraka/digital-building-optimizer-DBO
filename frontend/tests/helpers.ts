import type {
  BaselineResponse,
  FinancialSummary,
  OptimizeResponse,
  ResilienceResponse,
} from "@/lib/types";

export function minBaseline(): BaselineResponse {
  return {
    zip_code: "94105",
    county_fips: "06075",
    county_name: "San Francisco County",
    state: "CA",
    climate_zone_group: "mixed_dry_marine",
    tmy_station_id: "KSFO",
    annual_electricity_kwh: 551250,
    annual_gas_mmbtu: 1209.13,
    scope1_tco2e: 64.16,
    scope2_tco2e: 132.3,
    total_tco2e: 196.46,
    peak_kw: 84.45,
    spend: {
      electricity_usd: 120000,
      demand_charges_usd: 15121,
      gas_usd: 22973,
      total_usd: 158094,
    },
    monthly: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      electricity_kwh: 45000 + i * 500,
      gas_mmbtu: 90 + i,
    })),
    hourly_electric_kw: [],
    hourly_gas_mmbtu_per_hour: [],
    data_provenance: "synthetic",
  };
}

export function minFinancials(): FinancialSummary {
  return {
    capex_gross_usd: 850000,
    incentives_usd: 255000,
    capex_net_usd: 595000,
    annual_savings_yr1_usd: 80000,
    npv_usd: 120000,
    irr: 0.12,
    simple_payback_years: 7.4,
    eaas_annual_fee_yr1_usd: 68000,
    eaas_npv_customer_benefit_usd: 210000,
    capex_cashflow: Array.from({ length: 16 }, (_, i) => -595000 + i * 80000),
    eaas_net_cashflow: Array.from({ length: 16 }, (_, i) => 12000 * (i + 1)),
  };
}

export function minOptimize(): OptimizeResponse {
  return {
    county_name: "San Francisco County",
    state: "CA",
    climate_zone_group: "mixed_dry_marine",
    objective_mode: "max_npv",
    baseline_total_cost_usd: 158094,
    baseline_scope1_tco2e: 64.16,
    baseline_scope2_tco2e: 132.3,
    baseline_total_tco2e: 196.46,
    sizing: {
      pv_kw: 500,
      bess_kwh: 135.13,
      bess_kw: 33.78,
      hp_fraction: 0.9,
      hp_capacity_tons: 61.61,
    },
    dispatch: {
      annual_import_kwh: 300000,
      annual_export_kwh: 50000,
      annual_gas_mmbtu_after: 500,
      unmet_hours: 0,
      peak_kw_after: 60,
    },
    hourly_import_kw: [],
    hourly_export_kw: [],
    hourly_bess_soc_kwh: [],
    financials: minFinancials(),
    emissions_trajectory: Array.from({ length: 15 }, (_, i) => ({
      year: i + 1,
      scope1_tco2e: 30,
      scope2_tco2e: 72,
    })),
    target_met: null,
    evaluation_log: [],
  };
}

export function minResilience(): ResilienceResponse {
  return {
    county_fips: "06075",
    county_name: "San Francisco County",
    state: "CA",
    overall_before: 58,
    overall_after: 41,
    hazards: [
      { hazard: "extreme_heat", before: 60, after: 40, mitigations: ["x"] },
      { hazard: "cold", before: 30, after: 25, mitigations: ["y"] },
      { hazard: "flood", before: 40, after: 40, mitigations: [] },
      { hazard: "hurricane", before: 25, after: 25, mitigations: [] },
      { hazard: "wildfire", before: 90, after: 70, mitigations: ["z"] },
    ],
  };
}
