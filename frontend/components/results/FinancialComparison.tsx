"use client";

import { formatPercent, formatUsd, formatYears } from "@/lib/format";
import type { FinancialSummary } from "@/lib/types";

export function FinancialComparison({
  financials,
}: {
  financials: FinancialSummary;
}) {
  const rows: Array<[string, string, string]> = [
    [
      "Net upfront cost",
      formatUsd(financials.capex_net_usd),
      "—",
    ],
    [
      "Year-1 savings",
      formatUsd(financials.annual_savings_yr1_usd),
      formatUsd(financials.annual_savings_yr1_usd),
    ],
    [
      "Year-1 EaaS fee",
      "—",
      formatUsd(financials.eaas_annual_fee_yr1_usd),
    ],
    [
      "NPV (customer)",
      formatUsd(financials.npv_usd),
      formatUsd(financials.eaas_npv_customer_benefit_usd),
    ],
    [
      "IRR",
      financials.irr !== null ? formatPercent(financials.irr * 100) : "—",
      "n/a",
    ],
    [
      "Simple payback",
      financials.simple_payback_years !== null
        ? formatYears(financials.simple_payback_years)
        : "—",
      "n/a",
    ],
  ];

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="pb-2 pr-4 font-medium">Metric</th>
          <th className="pb-2 pr-4 font-medium">Direct CapEx</th>
          <th className="pb-2 font-medium">EaaS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, capex, eaas]) => (
          <tr key={label} className="border-b border-slate-100 last:border-0">
            <td className="py-2 pr-4 text-slate-600">{label}</td>
            <td className="py-2 pr-4 font-medium text-slate-900">{capex}</td>
            <td className="py-2 font-medium text-slate-900">{eaas}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
