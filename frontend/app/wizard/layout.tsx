"use client";

import { StepIndicator } from "@/components/wizard/StepIndicator";
import { WizardNav } from "@/components/wizard/WizardNav";

export default function WizardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
