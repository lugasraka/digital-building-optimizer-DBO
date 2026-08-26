import type { EChartsOption } from "echarts";
import type { BaselineResponse, FinancialSummary, OptimizeResponse, ResilienceResponse } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

// The backend returns yearly cashflows; the chart/CSV show cumulative values.
export function cumulative(arr: number[]): number[] {
  let acc = 0;
  return arr.map((v) => (acc += v));
}

// Aggregate an 8760-length hourly series into a 12 (month) x 24 (hour) grid.
export function monthHourAggregate(hourly: number[]): number[][] {
  const grid = Array.from({ length: 12 }, () => Array<number>(24).fill(0));
  hourly.forEach((v, h) => {
    const month = Math.min(11, Math.floor(h / 730.5));
    grid[month][h % 24] += v;
  });
  return grid;
}

export function emissionsDonutOption(b: BaselineResponse): EChartsOption {
  return {
    tooltip: { trigger: "item", valueFormatter: (v) => `${v} tCO₂e` },
    legend: { bottom: 0 },
    series: [
      {
        type: "pie",
        radius: ["45%", "75%"],
        label: { formatter: "{b}\n{c} tCO₂e" },
        data: [
          { name: "Scope 1 (gas)", value: round2(b.scope1_tco2e) },
          { name: "Scope 2 (grid)", value: round2(b.scope2_tco2e) },
        ],
      },
    ],
  };
}

export function costBreakdownOption(b: BaselineResponse): EChartsOption {
  return {
    tooltip: { trigger: "axis", valueFormatter: (v) => `$${Number(v).toLocaleString()}` },
    grid: { left: 56, right: 16, top: 16, bottom: 24 },
    xAxis: { type: "category", data: ["Electricity", "Demand charges", "Gas"] },
    yAxis: { type: "value", axisLabel: { formatter: (v: number) => `$${v / 1000}k` } },
    series: [
      {
        type: "bar",
        barMaxWidth: 56,
        data: [
          { name: "Electricity", value: round2(b.spend.electricity_usd) },
          { name: "Demand charges", value: round2(b.spend.demand_charges_usd) },
          { name: "Gas", value: round2(b.spend.gas_usd) },
        ],
      },
    ],
  };
}

export function monthlyLoadOption(b: BaselineResponse): EChartsOption {
  return {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0 },
    grid: { left: 56, right: 56, top: 16, bottom: 40 },
    xAxis: { type: "category", data: b.monthly.map((m) => `M${m.month}`) },
    yAxis: [
      { type: "value", name: "kWh", axisLabel: { formatter: (v: number) => `${v / 1000}k` } },
      { type: "value", name: "MMBtu", axisLabel: { formatter: (v: number) => `${v}` } },
    ],
    series: [
      {
        name: "Electricity (kWh)",
        type: "bar",
        data: b.monthly.map((m) => m.electricity_kwh),
      },
      {
        name: "Gas (MMBtu)",
        type: "line",
        yAxisIndex: 1,
        data: b.monthly.map((m) => m.gas_mmbtu),
      },
    ],
  };
}

export function dispatchHeatmapOption(importKw: number[]): EChartsOption {
  const grid = monthHourAggregate(importKw);
  const data: Array<[number, number, number]> = [];
  grid.forEach((row, m) => row.forEach((v, h) => data.push([h, m, round2(v)])));
  return {
    tooltip: {
      position: "top",
      formatter: (p: unknown) => {
        const { value } = p as { value: [number, number, number] };
        return `Hour ${value[0]}:00, Month ${value[1] + 1}<br/><strong>${value[2].toLocaleString()} kW</strong>`;
      },
    },
    grid: { left: 56, right: 16, top: 16, bottom: 48 },
    xAxis: { type: "category", data: Array.from({ length: 24 }, (_, h) => `${h}:00`), splitArea: { show: true } },
    yAxis: { type: "category", data: Array.from({ length: 12 }, (_, m) => `M${m + 1}`), splitArea: { show: true } },
    visualMap: {
      min: 0,
      max: Math.max(1, ...data.map((d) => d[2])),
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      inRange: { color: ["#e2e8f0", "#93c5fd", "#1d4ed8"] },
    },
    series: [{ type: "heatmap", data }],
  };
}

export function bessSocHeatmapOption(socKwh: number[]): EChartsOption {
  const grid = monthHourAggregate(socKwh);
  const data: Array<[number, number, number]> = [];
  grid.forEach((row, m) => row.forEach((v, h) => data.push([h, m, round2(v)])));
  return {
    tooltip: {
      position: "top",
      formatter: (p: unknown) => {
        const { value } = p as { value: [number, number, number] };
        return `Hour ${value[0]}:00, Month ${value[1] + 1}<br/><strong>${value[2].toLocaleString()} kWh</strong>`;
      },
    },
    grid: { left: 56, right: 16, top: 16, bottom: 48 },
    xAxis: { type: "category", data: Array.from({ length: 24 }, (_, h) => `${h}:00`), splitArea: { show: true } },
    yAxis: { type: "category", data: Array.from({ length: 12 }, (_, m) => `M${m + 1}`), splitArea: { show: true } },
    visualMap: {
      min: 0,
      max: Math.max(1, ...data.map((d) => d[2])),
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      inRange: { color: ["#ecfccb", "#84cc16", "#365314"] },
    },
    series: [{ type: "heatmap", data }],
  };
}

export function cashflowOption(f: FinancialSummary): EChartsOption {
  const years = f.capex_cashflow.length;
  const xAxis = Array.from({ length: years }, (_, i) => `Y${i}`);
  return {
    tooltip: { trigger: "axis", valueFormatter: (v) => `$${Number(v).toLocaleString()}` },
    legend: { bottom: 0 },
    grid: { left: 72, right: 16, top: 16, bottom: 40 },
    xAxis: { type: "category", data: xAxis },
    yAxis: { type: "value", axisLabel: { formatter: (v: number) => `$${v / 1000}k` } },
    series: [
      { name: "Direct CapEx (cumulative)", type: "line", data: cumulative(f.capex_cashflow) },
      { name: "EaaS (cumulative)", type: "line", data: cumulative(f.eaas_net_cashflow) },
    ],
  };
}

export function emissionsTrajectoryOption(o: OptimizeResponse): EChartsOption {
  return {
    tooltip: { trigger: "axis", valueFormatter: (v) => `${v} tCO₂e` },
    legend: { bottom: 0 },
    grid: { left: 56, right: 16, top: 16, bottom: 40 },
    xAxis: { type: "category", data: o.emissions_trajectory.map((y) => String(y.year)) },
    yAxis: { type: "value", name: "tCO₂e/yr" },
    series: [
      {
        name: "Scope 1 + Scope 2",
        type: "line",
        data: o.emissions_trajectory.map((y) => round2(y.scope1_tco2e + y.scope2_tco2e)),
      },
      {
        name: "Baseline total",
        type: "line",
        lineStyle: { type: "dashed" },
        data: o.emissions_trajectory.map(() => round2(o.baseline_total_tco2e)),
      },
    ],
  };
}

export function resilienceRadarOption(r: ResilienceResponse): EChartsOption {
  const indicators = r.hazards.map((h) => ({
    name: h.hazard.replace(/_/g, " "),
    max: 100,
  }));
  return {
    tooltip: {},
    legend: { bottom: 0 },
    radar: { indicator: indicators, radius: "65%" },
    series: [
      {
        type: "radar",
        data: [
          { name: "Before", value: r.hazards.map((h) => round2(h.before)) },
          { name: "After", value: r.hazards.map((h) => round2(h.after)) },
        ],
      },
    ],
  };
}
