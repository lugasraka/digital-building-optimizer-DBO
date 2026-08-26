"use client";

import type { OptimizeResponse } from "@/lib/types";

export function TargetBanner({ optimize }: { optimize: OptimizeResponse }) {
  if (optimize.objective_mode !== "target_co2") {
    return null;
  }
  const met = optimize.target_met === true;
  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 text-sm ${
        met
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {met
        ? "Decarbonization target met by the recommended package."
        : "Decarbonization target not met by the recommended package."}
    </div>
  );
}
