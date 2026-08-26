"use client";

import { STEPS, useWizard } from "@/store/wizard";

export function WizardNav() {
  const activeStep = useWizard((s) => s.activeStep);
  const canNavigateTo = useWizard((s) => s.canNavigateTo);
  const setActiveStep = useWizard((s) => s.setActiveStep);

  const idx = STEPS.indexOf(activeStep);
  const prev = idx > 0 ? STEPS[idx - 1] : undefined;
  const next = idx < STEPS.length - 1 ? STEPS[idx + 1] : undefined;
  const canNext = next !== undefined && canNavigateTo(next);

  return (
    <footer className="sticky bottom-0 border-t bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <button
          type="button"
          onClick={() => prev && setActiveStep(prev)}
          disabled={!prev}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        {next ? (
          <button
            type="button"
            onClick={() => setActiveStep(next)}
            disabled={!canNext}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        ) : (
          <span className="text-sm text-slate-400">Done</span>
        )}
      </div>
    </footer>
  );
}
