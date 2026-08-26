"use client";

import type { ReferenceDemoZip } from "@/lib/types";

interface ZipLookupProps {
  zip: string;
  demoZips: ReferenceDemoZip[];
  onChange: (zip: string) => void;
}

export function ZipLookup({ zip, demoZips, onChange }: ZipLookupProps) {
  return (
    <div>
      <label
        htmlFor="zip-code"
        className="block text-sm font-medium text-slate-700"
      >
        ZIP code
      </label>
      <input
        id="zip-code"
        type="text"
        inputMode="numeric"
        maxLength={5}
        value={zip}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
        placeholder="e.g. 94105"
        className="mt-1 block w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {demoZips.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-slate-500">Quick pick:</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {demoZips.map((dz) => (
              <button
                key={dz.zip}
                type="button"
                onClick={() => onChange(dz.zip)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  zip === dz.zip
                    ? "border-brand-700 bg-brand-50 text-brand-800"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {dz.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
