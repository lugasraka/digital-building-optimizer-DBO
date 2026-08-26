"use client";

interface FloorAreaInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function FloorAreaInput({ value, onChange }: FloorAreaInputProps) {
  return (
    <div>
      <label
        htmlFor="floor-area"
        className="block text-sm font-medium text-slate-700"
      >
        Floor area (sqft)
      </label>
      <div className="relative mt-1">
        <input
          id="floor-area"
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="e.g. 50000"
          className="block w-48 rounded-lg border border-slate-300 px-3 py-2 pr-14 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
          sqft
        </span>
      </div>
    </div>
  );
}
