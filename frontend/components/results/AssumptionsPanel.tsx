"use client";

import { useEffect, useState } from "react";

import { getApiClient } from "@/lib/api";
import { formatPercent, formatUsd } from "@/lib/format";
import type { ReferenceAssumptions } from "@/lib/types";

export function AssumptionsPanel() {
  const [assumptions, setAssumptions] = useState<ReferenceAssumptions | null>(null);

  useEffect(() => {
    getApiClient().getAssumptions().then(setAssumptions).catch(() => {});
  }, []);

  if (!assumptions) {
    return (
      <p className="text-xs text-slate-400">Loading model assumptions…</p>
    );
  }

  const rows: Array<[string, string]> = [
    ["Solar PV", `${formatUsd(assumptions.pv_usd_per_kw)}/kW installed`],
    ["Battery", `${formatUsd(assumptions.bess_usd_per_kwh)}/kWh installed`],
    ["Heat pump", `${formatUsd(assumptions.hp_usd_per_ton)}/ton installed`],
    ["ITC", formatPercent(assumptions.itc_rate * 100)],
    ["Discount rate", formatPercent(assumptions.discount_rate * 100)],
    ["Utility escalation", formatPercent(assumptions.utility_escalation * 100)],
    ["EaaS fee share", formatPercent(assumptions.eaas_fee_share * 100)],
    ["Analysis horizon", `${assumptions.analysis_years} years`],
  ];

  return (
    <div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5 pr-4 text-slate-500">{label}</td>
              <td className="py-1.5 text-right font-medium text-slate-800">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">{assumptions.provenance}</p>
    </div>
  );
}
