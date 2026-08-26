"use client";

import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";

import { STEP_TITLES, STEPS, useWizard } from "@/store/wizard";

export function StepIndicator() {
  const router = useRouter();
  // Subscribe to the gating data (not the stable helper functions) so the
  // rail re-renders when prerequisite state changes.
  useWizard(
    useShallow((s) => [
      s.facility,
      s.baseline,
      s.optimize,
      s.resilience,
      s.scenario,
    ]),
  );
  const activeStep = useWizard((s) => s.activeStep);
  const canNavigateTo = useWizard((s) => s.canNavigateTo);

  return (
    <nav aria-label="Wizard progress" className="mt-5">
      <ol className="flex flex-wrap items-center gap-y-2">
        {STEPS.map((step, i) => {
          const active = step === activeStep;
          const reachable = canNavigateTo(step);
          // A step is complete once a later step is reachable.
          const complete = i < STEPS.indexOf(activeStep);
          return (
            <li key={step} className="flex items-center">
              {i > 0 && (
                <span
                  className={`mx-2 h-px w-8 ${complete ? "bg-emerald-400" : "bg-slate-300"}`}
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                onClick={() => router.push(`/wizard/${step}`)}
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                className="group flex items-center gap-2 rounded-md px-1 py-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    active
                      ? "bg-brand-700 text-white ring-2 ring-brand-200"
                      : complete
                        ? "bg-emerald-100 text-emerald-700"
                        : reachable
                          ? "bg-slate-100 text-slate-600 group-hover:bg-brand-50 group-hover:text-brand-700"
                          : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {complete ? "✓" : i + 1}
                </span>
                <span
                  className={`text-sm ${
                    active
                      ? "font-semibold text-slate-900"
                      : reachable
                        ? "text-slate-600 group-hover:text-slate-900"
                        : "text-slate-400"
                  }`}
                >
                  {STEP_TITLES[step]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
