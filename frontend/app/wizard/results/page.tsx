"use client";

import { useEffect } from "react";

import { CashflowChart } from "@/components/charts/CashflowChart";
import { DispatchHeatmap } from "@/components/charts/DispatchHeatmap";
import { EmissionsTrajectoryChart } from "@/components/charts/EmissionsTrajectoryChart";
import { ResilienceRadar } from "@/components/charts/ResilienceRadar";
import { FinancialComparison } from "@/components/results/FinancialComparison";
import { ResilienceCard } from "@/components/results/ResilienceCard";
import { SizingCard } from "@/components/results/SizingCard";
import { TargetBanner } from "@/components/results/TargetBanner";
import { formatKwh, formatTco2e } from "@/lib/format";
import { useWizard } from "@/store/wizard";

function ErrorPanel({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{detail}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
      >
        Retry
      </button>
    </div>
  );
}

export default function ResultsPage() {
  const facility = useWizard((s) => s.facility);
  const scenario = useWizard((s) => s.scenario);
  const optimize = useWizard((s) => s.optimize);
  const resilience = useWizard((s) => s.resilience);
  const loading = useWizard((s) => s.loading);
  const error = useWizard((s) => s.error);
  const runOptimize = useWizard((s) => s.runOptimize);
  const runResilience = useWizard((s) => s.runResilience);

  useEffect(() => {
    if (!facility) return;
    if (!optimize) runOptimize();
    if (!resilience) runResilience();
  }, [facility, optimize, resilience, runOptimize, runResilience]);

  if (!facility) {
    return <p className="text-sm text-slate-500">Enter facility details first.</p>;
  }

  const busy = loading === "results" || (!optimize && !resilience && !error);

  return (
    <div className="space-y-8">
      {optimize && <TargetBanner optimize={optimize} />}

      {busy && !optimize && !resilience && (
        <p className="text-sm text-slate-500">
          Running optimization and resilience scoring…
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Recommended asset package
        </h2>
        <div className="mt-4">
          {optimize === null ? (
            error ? (
              <ErrorPanel
                title={error.title}
                detail={error.detail}
                onRetry={runOptimize}
              />
            ) : null
          ) : optimize.sizing === null ? (
            <div className="rounded-lg bg-slate-50 px-4 py-6 text-center">
              <p className="text-sm font-medium text-slate-700">
                No assets recommended
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Keeping current operations is optimal for this objective —
                modeled savings do not justify the investment.
              </p>
            </div>
          ) : (
            <>
              <SizingCard sizing={optimize.sizing} />
              <div className="mt-6">
                <FinancialComparison financials={optimize.financials!} />
              </div>
            </>
          )}
        </div>
      </section>

      {optimize !== null && optimize.sizing !== null && optimize.financials !== null && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Dispatch
              </h2>
              <span className="text-xs text-slate-400">
                Annual import {formatKwh(optimize.dispatch.annual_import_kwh)} ·{" "}
                {optimize.dispatch.unmet_hours > 0
                  ? `${optimize.dispatch.unmet_hours} unmet hours (load-shed slack)`
                  : "no unmet load"}
              </span>
            </div>
            <div className="mt-4">
              <DispatchHeatmap optimize={optimize} />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">
                CapEx vs Energy-as-a-Service
              </h2>
              <CashflowChart financials={optimize.financials} />
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">
                Emissions trajectory
              </h2>
              <EmissionsTrajectoryChart optimize={optimize} />
              <p className="mt-1 text-xs text-slate-400">
                Baseline total {formatTco2e(optimize.baseline_total_tco2e)} ·
                Scope 1 {formatTco2e(optimize.baseline_scope1_tco2e)} · Scope 2{" "}
                {formatTco2e(optimize.baseline_scope2_tco2e)}
              </p>
            </section>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Climate resilience
          </h2>
          <div className="mt-4">
            {resilience === null ? (
              error ? (
                <ErrorPanel
                  title={error.title}
                  detail={error.detail}
                  onRetry={runResilience}
                />
              ) : null
            ) : (
              <ResilienceCard resilience={resilience} />
            )}
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Hazard scores
          </h2>
          <div className="mt-4">
            {resilience && <ResilienceRadar resilience={resilience} />}
          </div>
        </section>
      </div>

      <p className="text-xs text-slate-400">
        Objective: {scenario.objective}
        {scenario.objective === "target_co2"
          ? ` · target ${scenario.co2_reduction_target_pct}%`
          : ""}
      </p>
    </div>
  );
}
