"use client";

import type { ObjectiveMode } from "@/lib/types";

interface ObjectiveSelectorProps {
  value: ObjectiveMode;
  onChange: (value: ObjectiveMode) => void;
}

const OPTIONS: Array<{ value: ObjectiveMode; title: string; blurb: string }> = [
  {
    value: "max_npv",
    title: "Maximize NPV",
    blurb: "Size assets for the best financial return.",
  },
  {
    value: "target_co2",
    title: "Meet decarbonization target",
    blurb: "Reach a CO₂ reduction target at minimum cost.",
  },
];

export function ObjectiveSelector({ value, onChange }: ObjectiveSelectorProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">Objective</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(o.value)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                selected
                  ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600"
                  : "border-slate-300 bg-white hover:bg-slate-50"
              }`}
            >
              <p
                className={`text-sm font-semibold ${
                  selected ? "text-blue-900" : "text-slate-800"
                }`}
              >
                {o.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{o.blurb}</p>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
