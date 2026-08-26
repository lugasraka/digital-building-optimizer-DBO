import { describe, expect, it } from "vitest";

import {
  bessSocHeatmapOption,
  cashflowOption,
  costBreakdownOption,
  dispatchHeatmapOption,
  emissionsDonutOption,
  emissionsTrajectoryOption,
  monthlyLoadOption,
  resilienceRadarOption,
} from "@/lib/chartOptions";
import type {
  BaselineResponse,
  FinancialSummary,
  OptimizeResponse,
  ResilienceResponse,
} from "@/lib/types";

function minBaseline(): BaselineResponse {
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

function minFinancials(): FinancialSummary {
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

function minOptimize(): OptimizeResponse {
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

function minResilience(): ResilienceResponse {
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

// ECharts accepts xAxis/yAxis as a single object or an array; normalize for tests.
function axisData(opt: Record<string, unknown>, axis: "xAxis" | "yAxis") {
  const a = opt[axis];
  return Array.isArray(a) ? a : [a];
}

describe("chart option builders", () => {
  it("emissions donut maps scope 1 and scope 2", () => {
    const opt = emissionsDonutOption(minBaseline());
    const series = (opt.series as Array<{ data: Array<{ name: string; value: number }> }>)[0];
    expect(series.data).toHaveLength(2);
    expect(series.data[0]).toMatchObject({ name: "Scope 1 (gas)", value: 64.16 });
    expect(series.data[1]).toMatchObject({ name: "Scope 2 (grid)", value: 132.3 });
  });

  it("cost breakdown sums to total spend", () => {
    const b = minBaseline();
    const opt = costBreakdownOption(b);
    const series = (opt.series as Array<{ data: Array<{ value: number }> }>)[0];
    const sum = series.data.reduce((acc, d) => acc + d.value, 0);
    expect(sum).toBeCloseTo(b.spend.total_usd, 0);
  });

  it("monthly load chart has 12 months on the x axis", () => {
    const b = minBaseline();
    const opt = monthlyLoadOption(b);
    const x = axisData(opt, "xAxis")[0];
    expect(x.data).toHaveLength(12);
    expect(x.data[0]).toBe("M1");
    const series = opt.series as Array<{ name: string; data: number[] }>;
    expect(series[0].name).toBe("Electricity (kWh)");
    expect(series[1].name).toBe("Gas (MMBtu)");
    expect(series[0].data).toEqual(b.monthly.map((m) => m.electricity_kwh));
  });

  it("dispatch heatmap aggregates hourly series to 12x24", () => {
    const hourly = new Array<number>(8760).fill(0);
    hourly[0] = 100;
    hourly[24] = 50;
    hourly[8760 - 1] = 10;
    const opt = dispatchHeatmapOption(hourly);
    const series = (opt.series as Array<{ data: Array<[number, number, number]> }>)[0];
    expect(series.data).toHaveLength(288);
    const total = series.data.reduce((acc, d) => acc + d[2], 0);
    expect(total).toBeCloseTo(160, 5);
    // hours 0 and 24 both land in hour-of-day 0, month 0; last hour in month 11
    expect(series.data.find((d) => d[0] === 0 && d[1] === 0)?.[2]).toBe(150);
    expect(series.data.find((d) => d[0] === 23 && d[1] === 11)?.[2]).toBe(10);
  });

  it("BESS SOC heatmap has 288 cells", () => {
    const opt = bessSocHeatmapOption(new Array<number>(8760).fill(0));
    const series = (opt.series as Array<{ data: Array<[number, number, number]> }>)[0];
    expect(series.data).toHaveLength(288);
  });

  it("cashflow chart has analysis_years + 1 x points", () => {
    const f = minFinancials();
    const opt = cashflowOption(f);
    const x = axisData(opt, "xAxis")[0];
    expect(x.data).toHaveLength(16);
    expect(x.data[0]).toBe("Y0");
  });

  it("emissions trajectory includes a baseline reference series", () => {
    const opt = emissionsTrajectoryOption(minOptimize());
    const series = opt.series as Array<{ name: string; data: number[] }>;
    expect(series).toHaveLength(2);
    expect(series[1].name).toBe("Baseline total");
    expect(series[1].data.every((v) => v === 196.46)).toBe(true);
    expect(series[0].data).toHaveLength(15);
  });

  it("resilience radar has two series with five axes", () => {
    const opt = resilienceRadarOption(minResilience());
    const radar = (opt.radar as { indicator: Array<{ name: string }> });
    expect(radar.indicator).toHaveLength(5);
    const series = (opt.series as Array<{ data: Array<{ name: string; value: number[] }> }>)[0];
    expect(series.data).toHaveLength(2);
    expect(series.data[0].name).toBe("Before");
    expect(series.data[1].name).toBe("After");
  });
});
