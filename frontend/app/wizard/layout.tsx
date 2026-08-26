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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LogoMark />
              <div>
                <h1 className="text-base font-semibold tracking-tight text-slate-900">
                  Digital Building Optimizer
                </h1>
                <p className="text-xs text-slate-500">
                  Energy, emissions &amp; resilience planning · prototype
                </p>
              </div>
            </div>
            <a
              href="/methods"
              className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline underline-offset-4"
            >
              Data &amp; Methods
            </a>
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

function LogoMark() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* building silhouette */}
      <path
        d="M6 32V10l12-6v28"
        stroke="#0f766e"
        strokeWidth="2.4"
        strokeLinejoin="round"
        fill="#f0fdfa"
      />
      <path d="M18 14h12v18" stroke="#0f766e" strokeWidth="2.4" fill="none" />
      <path
        d="M18 32h18"
        stroke="#0f766e"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* bolt */}
      <path d="M15 8l-4 9h5l-3 11 9-13h-5l3-7z" fill="#059669" />
    </svg>
  );
}
