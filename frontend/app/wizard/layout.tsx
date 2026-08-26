"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { StepIndicator } from "@/components/wizard/StepIndicator";
import { WizardNav } from "@/components/wizard/WizardNav";
import { STEPS, useWizard, type StepId } from "@/store/wizard";

export default function WizardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const setActiveStep = useWizard((s) => s.setActiveStep);

  // The URL is the source of truth for the active step.
  useEffect(() => {
    const step = pathname.split("/").pop() as StepId;
    if (STEPS.includes(step)) {
      setActiveStep(step);
    }
  }, [pathname, setActiveStep]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-4">
          <div className="flex items-baseline justify-between">
            <h1 className="text-lg font-semibold text-slate-900">
              DBO Prototype
            </h1>
            <span className="text-xs text-slate-500">
              Decarbonization Business Optimizer
            </span>
          </div>
          <StepIndicator />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      <WizardNav />
    </div>
  );
}
