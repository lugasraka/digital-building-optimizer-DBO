"use client";

interface TargetSliderProps {
  value: number | null;
  onChange: (value: number) => void;
}

export function TargetSlider({ value, onChange }: TargetSliderProps) {
  const current = value ?? 40;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label
          htmlFor="co2-target"
          className="block text-sm font-medium text-slate-700"
        >
          CO₂ reduction target
        </label>
        <span className="text-lg font-semibold text-blue-700">{current}%</span>
      </div>
      <input
        id="co2-target"
        type="range"
        min={5}
        max={100}
        step={5}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-blue-600"
      />
      <div className="flex justify-between text-xs text-slate-400">
        <span>5%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
