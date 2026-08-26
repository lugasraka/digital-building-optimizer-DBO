import { cumulative } from "./chartOptions";
import type {
  BaselineResponse,
  OptimizeResponse,
  ResilienceResponse,
} from "./types";

export interface SummaryData {
  baseline: BaselineResponse;
  optimize: OptimizeResponse;
  resilience: ResilienceResponse;
}

// One CSV with three sections: baseline monthly, emissions trajectory, and
// cumulative cashflows. Values are round-trippable numbers, not formatted strings.
export function summaryCsv(data: SummaryData): string {
  const rows: string[][] = [];

  rows.push(["Baseline monthly"]);
  rows.push(["month", "electricity_kwh", "gas_mmbtu"]);
  for (const m of data.baseline.monthly) {
    rows.push([String(m.month), String(m.electricity_kwh), String(m.gas_mmbtu)]);
  }

  rows.push([]);
  rows.push(["Emissions trajectory"]);
  rows.push(["year", "scope1_tco2e", "scope2_tco2e"]);
  for (const y of data.optimize.emissions_trajectory) {
    rows.push([String(y.year), String(y.scope1_tco2e), String(y.scope2_tco2e)]);
  }

  rows.push([]);
  rows.push(["Cashflows (cumulative)"]);
  rows.push(["year", "capex_cumulative_usd", "eaas_cumulative_usd"]);
  const capex = cumulative(data.optimize.financials?.capex_cashflow ?? []);
  const eaas = cumulative(data.optimize.financials?.eaas_net_cashflow ?? []);
  const years = Math.max(capex.length, eaas.length);
  for (let i = 0; i < years; i++) {
    rows.push([String(i), String(capex[i] ?? ""), String(eaas[i] ?? "")]);
  }

  return rows.map((r) => r.join(",")).join("\n") + "\n";
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
