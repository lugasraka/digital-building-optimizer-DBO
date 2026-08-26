"use client";

import type { BuildingType, ReferenceBuildingType } from "@/lib/types";

interface BuildingTypeCardsProps {
  value: BuildingType;
  types: ReferenceBuildingType[];
  onChange: (value: BuildingType) => void;
}

export function BuildingTypeCards({ value, types, onChange }: BuildingTypeCardsProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">Building type</legend>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {types.map((t) => {
          const selected = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(t.value)}
              className={`rounded-lg border px-3 py-3 text-left text-sm shadow-sm transition-colors ${
                selected
                  ? "border-brand-700 bg-brand-50 text-brand-900 ring-1 ring-brand-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
