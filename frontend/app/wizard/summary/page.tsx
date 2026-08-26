"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { downloadCsv, summaryCsv } from "@/lib/csv";
import { getApiClient } from "@/lib/api";
import { downloadPdfReport } from "@/lib/pdf/download";
import { formatPercent, formatTco2e, formatUsd } from "@/lib/format";
import type { OptimizeResponse, ReferenceBuildingType } from "@/lib/types";
import { useWizard } from "@/store/wizard";
import { Button, Card, SectionHeading } from "@/components/ui";

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
  const router = useRouter();

  const [buildingTypes, setBuildingTypes] = useState<ReferenceBuildingType[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
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

  const onDownloadPdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      await downloadPdfReport({
        facility,
        baseline,
        optimize,
        resilience,
        buildingTypeLabel: typeLabel,
      });
    } catch (e) {
      setPdfError(
        `PDF generation failed${e instanceof Error ? `: ${e.message}` : ""}`,
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const topHazard = [...resilience.hazards].sort((a, b) => b.before - a.before)[0];

  const year1 =
    optimize.emissions_trajectory.length > 0
      ? optimize.emissions_trajectory[0].scope1_tco2e +
        optimize.emissions_trajectory[0].scope2_tco2e
      : null;

  return (
    <div className="space-y-8">
      <Card>
        <SectionHeading
          title="Executive summary"
          hint="Recommended decarbonization package and its business case."
        />
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Facility</dt>
            <dd className="num mt-1 font-medium text-slate-900">{typeLabel}</dd>
            <dd className="text-slate-500">
              {facility.zip_code} · {baseline.county_name}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Floor area</dt>
            <dd className="num mt-1 font-medium text-slate-900">
              {Math.round(facility.floor_area_sqft).toLocaleString()} sqft
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Baseline emissions</dt>
            <dd className="num mt-1 font-medium text-slate-900">
              {formatTco2e(baseline.total_tco2e)}/yr
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Baseline spend</dt>
            <dd className="num mt-1 font-medium text-slate-900">
              {formatUsd(baseline.spend.total_usd)}/yr
            </dd>
          </div>
        </dl>
        <p className="mt-6 rounded-lg bg-brand-50 px-4 py-3 text-sm leading-relaxed text-slate-700 ring-1 ring-inset ring-brand-600/10">
          {recommendation(optimize)}
        </p>
      </Card>

      {optimize.sizing !== null && optimize.financials !== null && year1 !== null && (
        <Card>
          <SectionHeading title="Financial outlook" />
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Net CapEx</p>
              <p className="num mt-1 font-medium text-slate-900">
                {formatUsd(optimize.financials.capex_net_usd)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">NPV (CapEx)</p>
              <p className="num mt-1 font-medium text-slate-900">
                {formatUsd(optimize.financials.npv_usd)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">NPV (EaaS)</p>
              <p className="num mt-1 font-medium text-slate-900">
                {formatUsd(optimize.financials.eaas_npv_customer_benefit_usd)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Simple payback</p>
              <p className="num mt-1 font-medium text-slate-900">
                {optimize.financials.simple_payback_years !== null
                  ? `${optimize.financials.simple_payback_years.toFixed(1)} yr`
                  : "—"}
              </p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Projected year-one emissions:{" "}
            <span className="num font-semibold">{formatTco2e(year1)}/yr</span> —{" "}
            <span className="num font-semibold">
              {formatPercent((1 - year1 / optimize.baseline_total_tco2e) * 100)}
            </span>{" "}
            below baseline.
          </p>
        </Card>
      )}

      <Card>
        <SectionHeading title="Resilience highlights" />
        <p className="text-sm leading-relaxed text-slate-700">
          Overall exposure improves from{" "}
          <span className="num font-semibold">{resilience.overall_before}</span> to{" "}
          <span className="num font-semibold text-emerald-700">
            {resilience.overall_after}
          </span>{" "}
          (0–100, lower is better). Top hazard:{" "}
          <span className="font-medium capitalize">
            {topHazard.hazard.replace(/_/g, " ")}
          </span>{" "}
          at {topHazard.before} before mitigation.
        </p>
      </Card>

      <Card>
        <SectionHeading
          title="Deliverables"
          hint="Take the results with you — data and rationale included."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="accent" onClick={onDownloadPdf} disabled={pdfBusy}>
            {pdfBusy ? "Generating PDF…" : "Download PDF report"}
          </Button>
          <Button variant="secondary" onClick={onDownload}>
            Download CSV
          </Button>
          <Button variant="ghost" onClick={() => router.push("/methods")}>
            Data sources &amp; methodology →
          </Button>
        </div>
        {pdfError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {pdfError}
          </p>
        )}
      </Card>

      <div className="flex gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            reset();
            router.push("/wizard/facility");
          }}
        >
          Start over
        </Button>
      </div>
    </div>
  );
}
