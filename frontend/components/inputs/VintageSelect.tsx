"use client";

import type { Vintage } from "@/lib/types";

interface VintageSelectProps {
  value: Vintage | "";
  onChange: (value: Vintage | "") => void;
}

const OPTIONS: Array<{ value: Vintage; label: string }> = [
  { value: "pre1980", label: "Pre-1980" },
  { value: "1980_2004", label: "1980–2004" },
  { value: "post2004", label: "Post-2004" },
];

export function VintageSelect({ value, onChange }: VintageSelectProps) {
  return (
    <div>
      <label
        htmlFor="vintage"
        className="block text-sm font-medium text-slate-700"
      >
        Construction vintage
      </label>
      <select
        id="vintage"
        value={value}
        onChange={(e) => onChange(e.target.value as Vintage | "")}
        className="mt-1 block w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Not sure (default)</option>
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-400">
        Defaults to 1980–2004 when left blank.
      </p>
    </div>
  );
}
