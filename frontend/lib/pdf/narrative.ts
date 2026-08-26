import type {
  BaselineResponse,
  FacilityInput,
  OptimizeResponse,
  ResilienceResponse,
} from "@/lib/types";

export interface AssetRationale {
  asset: string;
  title: string;
  rationale: string;
}

/**
 * Composes a human-readable rationale paragraph per selected asset.
 * Pure function over API responses — unit-testable, no side effects.
 */
export function assetRationales(
  facility: FacilityInput,
  optimize: OptimizeResponse,
): AssetRationale[] {
  const out: AssetRationale[] = [];
  const sizing = optimize.sizing;
  if (!sizing) {
    return [
      {
        asset: "none",
        title: "No assets recommended",
        rationale:
          "Under the selected objective and asset mix, no clean-energy investment clears its cost in this market. Modeled year-1 savings do not justify the capital; consider revisiting the objective or enabling additional assets.",
      },
    ];
  }

  if (sizing.pv_kw > 0) {
    out.push({
      asset: "pv",
      title: `Solar PV — ${Math.round(sizing.pv_kw)} kW`,
      rationale:
        `A ${Math.round(sizing.pv_kw)} kW rooftop-scale array is sized against the facility's ` +
        `${Math.round(facility.floor_area_sqft).toLocaleString()} sqft footprint and the solar yield of the ` +
        `${optimize.climate_zone_group.replace(/_/g, " ")} climate zone. On-site generation directly offsets ` +
        `imported electricity at the retail rate and reduces Scope 2 emissions; the optimizer only retains ` +
        `capacity whose marginal energy value clears its lifecycle cost under the selected objective.`,
    });
  }

  if (sizing.bess_kwh > 0) {
    out.push({
      asset: "bess",
      title: `Battery storage — ${Math.round(sizing.bess_kwh)} kWh / ${Math.round(sizing.bess_kw)} kW`,
      rationale:
        `The ${Math.round(sizing.bess_kwh)} kWh battery is paired with PV to shift solar output into ` +
        `evening peaks and to clip the monthly demand peak (reduced to ` +
        `${Math.round(optimize.dispatch.peak_kw_after).toLocaleString()} kW after optimization). It also ` +
        `captures excess solar that would otherwise be exported at a fraction of retail value. Battery sizing ` +
        `follows the hourly dispatch across all 8,760 modeled hours.`,
    });
  }

  if (sizing.hp_fraction > 0) {
    out.push({
      asset: "heat_pump",
      title: `Heat pump retrofit — ${Math.round(sizing.hp_fraction * 100)}% of thermal load`,
      rationale:
        `Electrifying ${Math.round(sizing.hp_fraction * 100)}% of peak thermal load (~` +
        `${Math.round(sizing.hp_capacity_tons)} tons) displaces on-site gas combustion in the ` +
        `${optimize.climate_zone_group.replace(/_/g, " ")} zone, converting fossil Scope 1 emissions into ` +
        `(cleaner) grid electricity. This is recommended where the resulting electric load, served by the ` +
        `optimized PV + storage mix and local grid carbon intensity, lowers net cost or emissions versus gas.`,
    });
  }

  if (out.length === 0) {
    out.push({
      asset: "none",
      title: "No assets recommended",
      rationale:
        "Under the selected objective and asset mix, no clean-energy investment clears its cost in this market. Modeled year-1 savings do not justify the capital; consider revisiting the objective or enabling additional assets.",
    });
  }
  return out;
}

/** CapEx vs EaaS verdict paragraph. */
export function financialVerdict(
  optimize: OptimizeResponse,
): string | null {
  const f = optimize.financials;
  if (!f) return null;
  const capexWins = f.npv_usd >= f.eaas_npv_customer_benefit_usd;
  if (capexWins) {
    return (
      `Direct CapEx delivers the higher customer NPV (${fmtUsd(f.npv_usd)} vs ${fmtUsd(
        f.eaas_npv_customer_benefit_usd,
      )} under EaaS). Net CapEx of ${fmtUsd(f.capex_net_usd)} after ` +
      `${fmtUsd(f.incentives_usd)} of incentives yields year-1 savings of ${fmtUsd(
        f.annual_savings_yr1_usd,
      )}` +
      (f.simple_payback_years !== null
        ? ` and a simple payback of ${f.simple_payback_years.toFixed(1)} years.`
        : ".")
    );
  }
  return (
    `Energy-as-a-Service delivers the higher customer NPV (${fmtUsd(
      f.eaas_npv_customer_benefit_usd,
    )} vs ${fmtUsd(f.npv_usd)} under direct CapEx) with zero upfront capital — ` +
    `the provider owns and maintains the assets for a fixed annual fee (year-1: ${fmtUsd(
      f.eaas_annual_fee_yr1_usd,
    )}), suitable where balance-sheet capital is constrained.`
  );
}

/** Whether the scenario's CO2 target was met. */
export function targetVerdict(optimize: OptimizeResponse): string | null {
  if (optimize.target_met === null || optimize.objective_mode !== "target_co2") {
    return null;
  }
  return optimize.target_met
    ? "The selected CO₂ reduction target is met by the recommended package."
    : "The selected CO₂ reduction target could not be met with the enabled asset set; results show the maximum achievable reduction.";
}

/** Resilience summary reusing the API-returned mitigation actions. */
export function resilienceNarrative(r: ResilienceResponse): string[] {
  const lines: string[] = [
    `Overall county hazard exposure improves from ${r.overall_before} to ${r.overall_after} (0–100 index, lower is better) once storage and solar provide ride-through capability.`,
  ];
  const top = [...r.hazards].sort((a, b) => b.before - a.before)[0];
  if (top && top.mitigations.length > 0) {
    lines.push(
      `Top hazard: ${top.hazard.replace(/_/g, " ")}. Recommended mitigations from the risk model: ${top.mitigations.join("; ")}.`,
    );
  }
  return lines;
}

/** Baseline snapshot line used in the report intro. */
export function baselineSummary(
  facility: FacilityInput,
  baseline: BaselineResponse,
): string {
  return (
    `The ${facility.building_type.replace(/_/g, " ")} facility at ZIP ${facility.zip_code} ` +
    `(county: ${baseline.county_name}) currently emits ~${Math.round(baseline.total_tco2e)} tCO₂e per year ` +
    `and spends ~${fmtUsd(baseline.spend.total_usd)} annually on energy.` +
    (facility.vintage ? ` Construction vintage cohort: ${facility.vintage.replace(/_/g, " ")}.` : "")
  );
}

export function provenanceNote(): string {
  return (
    "Methodology & data sources: energy-use benchmarks derive from CBECS 2018 survey medians; tariffs and " +
    "grid emission factors from EIA state averages and EPA eGRID2022; hazard scores from FEMA NRI county data; " +
    "weather and solar profiles are deterministic synthetic approximations. Dispatch is an hourly linear program. " +
    "Outputs are directionally credible, not investment-grade."
  );
}

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}
