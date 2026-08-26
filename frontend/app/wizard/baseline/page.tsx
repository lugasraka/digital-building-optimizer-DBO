"use client";

import { useEffect } from "react";

import { CostBreakdown } from "@/components/charts/CostBreakdown";
import { EmissionsDonut } from "@/components/charts/EmissionsDonut";
import { MonthlyLoadChart } from "@/components/charts/MonthlyLoadChart";
import { MetricCard } from "@/components/results/MetricCard";
import {
  formatKwh,
  formatKw,
  formatMmbtu,
  formatTco2e,
  formatUsd,
} from "@/lib/format";
import { useWizard } from "@/store/wizard";

export default function BaselinePage() {
  const facility = useWizard((s) => s.facility);
  const baseline = useWizard((s) => s.baseline);
  const loading = useWizard((s) => s.loading);
  const error = useWizard((s) => s.error);
  const runBaseline = useWizard((s) => s.runBaseline);

  useEffect(() => {
    if (facility && !baseline && loading !== "baseline") {
      runBaseline();
    }
  }, [facility, baseline, loading, runBaseline]);

  if (!facility) {
    return <p className="text-sm text-slate-500">Enter facility details first.</p>;
  }

  if (!baseline) {
    return (
      <div className="space-y-4">
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <p className="font-semibold">{error.title}</p>
            <p className="mt-0.5">{error.detail}</p>
            <button
              type="button"
              onClick={runBaseline}
              className="mt-3 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
            >
              Retry
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Running baseline for {facility.zip_code}…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Annual electricity"
          value={formatKwh(baseline.annual_electricity_kwh)}
        />
        <MetricCard
          label="Annual gas"
          value={formatMmbtu(baseline.annual_gas_mmbtu)}
        />
        <MetricCard
          label="Total emissions"
          value={formatTco2e(baseline.total_tco2e)}
          hint={`Scope 1 ${formatTco2e(baseline.scope1_tco2e)} · Scope 2 ${formatTco2e(baseline.scope2_tco2e)}`}
        />
        <MetricCard label="Peak demand" value={formatKw(baseline.peak_kw)} />
        <MetricCard
          label="Annual spend"
          value={formatUsd(baseline.spend.total_usd)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Emissions by scope
          </h2>
          <EmissionsDonut baseline={baseline} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Annual utility spend
          </h2>
          <CostBreakdown baseline={baseline} />
          <p className="mt-2 text-xs text-slate-400">
            Electricity ${formatUsd(baseline.spend.electricity_usd)} · Demand
            charges ${formatUsd(baseline.spend.demand_charges_usd)} · Gas $
            {formatUsd(baseline.spend.gas_usd)}
          </p>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Monthly load profile
        </h2>
        <MonthlyLoadChart baseline={baseline} />
      </section>

      <p className="text-xs text-slate-400">{baseline.data_provenance}</p>
    </div>
  );
}
