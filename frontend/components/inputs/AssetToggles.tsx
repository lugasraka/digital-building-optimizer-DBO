"use client";

import type { AssetToggles as AssetTogglesType } from "@/lib/types";

interface AssetTogglesProps {
  value: AssetTogglesType;
  onChange: (value: AssetTogglesType) => void;
}

const OPTIONS: Array<{ key: keyof AssetTogglesType; title: string; blurb: string }> = [
  { key: "pv", title: "Solar PV", blurb: "Rooftop solar generation" },
  { key: "bess", title: "Battery storage", blurb: "BESS for peak shaving and backup" },
  { key: "heat_pump", title: "Heat pump", blurb: "Gas-to-electric heating conversion" },
];

export function AssetToggles({ value, onChange }: AssetTogglesProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">Assets to model</legend>
      <div className="mt-2 space-y-2">
        {OPTIONS.map((o) => {
          const checked = value[o.key];
          return (
            <label
              key={o.key}
              className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  {o.title}
                </span>
                <span className="block text-xs text-slate-500">{o.blurb}</span>
              </span>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  onChange({ ...value, [o.key]: e.target.checked })
                }
                className="h-4 w-4 rounded accent-brand-700"
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
