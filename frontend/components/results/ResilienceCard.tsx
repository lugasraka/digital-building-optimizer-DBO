"use client";

import type { ResilienceResponse } from "@/lib/types";

export function ResilienceCard({
  resilience,
}: {
  resilience: ResilienceResponse;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="text-sm text-slate-500">
          Overall exposure{" "}
          <span className="font-semibold text-slate-900">
            {resilience.overall_before}
          </span>{" "}
          →{" "}
          <span className="font-semibold text-emerald-700">
            {resilience.overall_after}
          </span>
        </span>
        <span className="text-xs text-slate-400">(0–100, lower is better)</span>
      </div>
      <ul className="mt-4 space-y-3">
        {resilience.hazards.map((h) => (
          <li key={h.hazard} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium capitalize text-slate-800">
                {h.hazard.replace(/_/g, " ")}
              </span>
              <span className="text-sm">
                <span className="font-medium text-slate-600">{h.before}</span>
                <span className="text-slate-400"> → </span>
                <span className="font-medium text-emerald-700">{h.after}</span>
              </span>
            </div>
            {h.mitigations.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {h.mitigations.map((m) => (
                  <li
                    key={m}
                    className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-800"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
