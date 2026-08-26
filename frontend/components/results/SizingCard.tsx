"use client";

import { formatPercent } from "@/lib/format";
import type { AssetSizing } from "@/lib/types";

export function SizingCard({ sizing }: { sizing: AssetSizing }) {
  const rows: Array<[string, string]> = [
    ["Solar PV", `${sizing.pv_kw.toLocaleString()} kW`],
    ["Battery", `${sizing.bess_kwh.toLocaleString()} kWh (${sizing.bess_kw.toLocaleString()} kW)`],
    ["Heat pump", `${formatPercent(sizing.hp_fraction * 100)} of peak thermal load`],
    ["Heat pump capacity", `${sizing.hp_capacity_tons.toLocaleString()} tons`],
  ];
  return (
    <div className="grid grid-cols-2 gap-4">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
        </div>
      ))}
    </div>
  );
}
