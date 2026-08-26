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
import { minBaseline, minFinancials, minOptimize, minResilience } from "./helpers";

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

  it("cashflow chart has analysis_years + 1 cumulative points", () => {
    const f = minFinancials();
    const opt = cashflowOption(f);
    const x = axisData(opt, "xAxis")[0];
    expect(x.data).toHaveLength(16);
    expect(x.data[0]).toBe("Y0");
    const series = opt.series as Array<{ name: string; data: number[] }>;
    // Cumulative: last capex value = sum of yearly flows = 80000
    expect(series[0].data[15]).toBeCloseTo(80000, 0);
    expect(series[1].data[15]).toBeGreaterThan(series[1].data[0]);
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
