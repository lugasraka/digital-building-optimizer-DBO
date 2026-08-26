"use client";

import { useEffect, useState } from "react";

import { downloadCsv, summaryCsv } from "@/lib/csv";
import { getApiClient } from "@/lib/api";
import { formatPercent, formatTco2e, formatUsd } from "@/lib/format";
import type { OptimizeResponse, ReferenceBuildingType } from "@/lib/types";
import { useWizard } from "@/store/wizard";

function recommendation(optimize: OptimizeResponse): string {
  if (optimize.sizing === null || optimize.financials === null) {
    return "No clean-energy assets are recommended: modeled year-1 savings do not justify the investment under the selected objective. Consider revisiting the objective or asset mix.";
  }
  const { sizing, financials } = optimize;
  const parts: string[] = [];
  if (sizing.pv_kw > 0) parts.push(`${Math.round(sizing.pv_kw)} kW of solar PV`);
  if (sizing.bess_kwh > 0)
    parts.push(`${Math.round(sizing.bess_kwh)} kWh of battery storage`);
  if (sizing.hp_fraction > 0)
    parts.push(
      `a heat pump covering ${Math.round(sizing.hp_fraction * 100)}% of peak thermal load`,
    );
  const assets = parts.length > 0 ? parts.join(", ") : "no assets";
  const compare =
    financials.npv_usd >= financials.eaas_npv_customer_benefit_usd
      ? "direct CapEx maximizes customer NPV"
      : "Energy-as-a-Service maximizes customer NPV with zero upfront capital";
  return `Recommended package: ${assets}. Net CapEx ${formatUsd(
    financials.capex_net_usd,
  )} with year-1 savings of ${formatUsd(
    financials.annual_savings_yr1_usd,
  )}; ${compare}.`;
}

export default function SummaryPage() {
  const facility = useWizard((s) => s.facility);
  const baseline = useWizard((s) => s.baseline);
  const optimize = useWizard((s) => s.optimize);
  const resilience = useWizard((s) => s.resilience);
  const reset = useWizard((s) => s.reset);

  const [buildingTypes, setBuildingTypes] = useState<ReferenceBuildingType[]>([]);
  useEffect(() => {
    getApiClient().getBuildingTypes().then(setBuildingTypes).catch(() => {});
  }, []);
  const typeLabel =
    buildingTypes.find((t) => t.value === facility?.building_type)?.label ??
    facility?.building_type ??
    "";

  if (!facility || !baseline || !optimize || !resilience) {
    return <p className="text-sm text-slate-500">Complete the wizard first.</p>;
  }

  const onDownload = () => {
    downloadCsv(
      `dbo-summary-${facility.zip_code}.csv`,
      summaryCsv({ baseline, optimize, resilience }),
    );
  };

  const topHazard = [...resilience.hazards].sort((a, b) => b.before - a.before)[0];

  const year1 =
    optimize.emissions_trajectory.length > 0
      ? optimize.emissions_trajectory[0].scope1_tco2e +
        optimize.emissions_trajectory[0].scope2_tco2e
      : null;

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Executive summary</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Facility</dt>
            <dd className="mt-1 font-medium text-slate-900">{typeLabel}</dd>
            <dd className="text-slate-500">
              {facility.zip_code} · {baseline.county_name}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Floor area</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {Math.round(facility.floor_area_sqft).toLocaleString()} sqft
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Baseline emissions</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {formatTco2e(baseline.total_tco2e)}/yr
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Baseline spend</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {formatUsd(baseline.spend.total_usd)}/yr
            </dd>
          </div>
        </dl>
        <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {recommendation(optimize)}
        </p>
      </section>

      {optimize.sizing !== null && optimize.financials !== null && year1 !== null && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Financial outlook</h3>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Net CapEx</p>
              <p className="mt-1 font-medium text-slate-900">
                {formatUsd(optimize.financials.capex_net_usd)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">NPV (CapEx)</p>
              <p className="mt-1 font-medium text-slate-900">
                {formatUsd(optimize.financials.npv_usd)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">NPV (EaaS)</p>
              <p className="mt-1 font-medium text-slate-900">
                {formatUsd(optimize.financials.eaas_npv_customer_benefit_usd)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Simple payback</p>
              <p className="mt-1 font-medium text-slate-900">
                {optimize.financials.simple_payback_years !== null
                  ? `${optimize.financials.simple_payback_years.toFixed(1)} yr`
                  : "—"}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Projected year-one emissions: {formatTco2e(year1)}/yr —{" "}
            {formatPercent((1 - year1 / optimize.baseline_total_tco2e) * 100)} below
            baseline.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Resilience highlights</h3>
        <p className="mt-3 text-sm text-slate-700">
          Overall exposure improves from{" "}
          <span className="font-semibold">{resilience.overall_before}</span> to{" "}
          <span className="font-semibold text-emerald-700">
            {resilience.overall_after}
          </span>{" "}
          (0–100, lower is better). Top hazard:{" "}
          <span className="font-medium capitalize">
            {topHazard.hazard.replace(/_/g, " ")}
          </span>{" "}
          at {topHazard.before} before mitigation.
        </p>
      </section>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDownload}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
