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
    <nav aria-label="Wizard progress" className="mt-4">
      <ol className="flex flex-wrap items-center gap-y-2">
        {STEPS.map((step, i) => {
          const active = step === activeStep;
          const reachable = canNavigateTo(step);
          const dotClass = active
            ? "bg-blue-600 text-white"
            : reachable
              ? "bg-blue-100 text-blue-700"
              : "bg-slate-100 text-slate-400";
          return (
            <li key={step} className="flex items-center">
              {i > 0 && <span className="mx-2 h-px w-6 bg-slate-300" aria-hidden="true" />}
              <button
                type="button"
                onClick={() => router.push(`/wizard/${step}`)}
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                className="group flex items-center gap-2 disabled:cursor-not-allowed"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${dotClass}`}
                >
                  {i + 1}
                </span>
                <span
                  className={`text-sm ${active ? "font-semibold text-slate-900" : "text-slate-500"}`}
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
