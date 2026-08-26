import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import {
  assetRationales,
  baselineSummary,
  financialVerdict,
  provenanceNote,
  resilienceNarrative,
  targetVerdict,
} from "@/lib/pdf/narrative";
import type {
  BaselineResponse,
  FacilityInput,
  OptimizeResponse,
  ResilienceResponse,
} from "@/lib/types";

const BRAND = "#0f766e";
const EMERALD = "#059669";
const INK = "#1e293b";
const MUTED = "#64748b";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", color: INK },
  coverBand: {
    backgroundColor: BRAND,
    color: "#ffffff",
    padding: 24,
    borderRadius: 8,
    marginBottom: 20,
  },
  brand: { fontSize: 16, fontWeight: 700 },
  subtitle: { fontSize: 9, marginTop: 2, opacity: 0.85 },
  h1: { fontSize: 13, fontWeight: 700, marginBottom: 6, marginTop: 14 },
  p: { fontSize: 10, lineHeight: 1.5 },
  muted: { color: MUTED, fontSize: 8 },
  table: { display: "flex", width: "100%", marginTop: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 4 },
  cell: { flex: 1, fontSize: 9 },
  cellBold: { flex: 1, fontSize: 9, fontWeight: 700 },
  rationaleTitle: { fontSize: 10, fontWeight: 700, marginTop: 6 },
  footnote: {
    marginTop: 24,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    color: MUTED,
    fontSize: 7.5,
    lineHeight: 1.4,
  },
});

function usd(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: MUTED }}>{label}</Text>
      <Text style={{ fontWeight: 700 }}>{value}</Text>
    </View>
  );
}

export function SummaryReport({
  facility,
  baseline,
  optimize,
  resilience,
  buildingTypeLabel,
}: {
  facility: FacilityInput;
  baseline: BaselineResponse;
  optimize: OptimizeResponse;
  resilience: ResilienceResponse;
  buildingTypeLabel: string;
}) {
  const rationales = assetRationales(facility, optimize);
  const verdict = financialVerdict(optimize);
  const target = targetVerdict(optimize);
  const resilienceLines = resilienceNarrative(resilience);

  return (
    <Document
      title="DBO Decarbonization Summary"
      author="Digital Building Optimizer (prototype)"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.coverBand}>
          <Text style={styles.brand}>Digital Building Optimizer</Text>
          <Text style={styles.subtitle}>
            Decarbonization summary — {buildingTypeLabel} · ZIP{" "}
            {facility.zip_code} ·{" "}
            {new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </View>

        <Text style={styles.h1}>Facility &amp; baseline</Text>
        <Text style={styles.p}>{baselineSummary(facility, baseline)}</Text>
        <View style={[styles.table, { maxWidth: 320 }]}>
          <View style={styles.row}>
            <Text style={styles.cellBold}>Baseline emissions</Text>
            <Text style={styles.cell}>
              {baseline.total_tco2e.toFixed(1)} tCO₂e/yr
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellBold}>Annual energy spend</Text>
            <Text style={styles.cell}>{usd(baseline.spend.total_usd)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellBold}>Peak demand</Text>
            <Text style={styles.cell}>
              {Math.round(baseline.peak_kw).toLocaleString()} kW
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellBold}>Climate zone group</Text>
            <Text style={styles.cell}>
              {optimize.climate_zone_group.replace(/_/g, " ")}
            </Text>
          </View>
        </View>

        <Text style={styles.h1}>Recommended package</Text>
        {target && (
          <Text
            style={[
              styles.p,
              {
                marginBottom: 4,
                paddingVertical: 4,
                paddingHorizontal: 8,
                backgroundColor: EMERALD + "18",
                borderRadius: 4,
                color: "#065f46",
              },
            ]}
          >
            {target}
          </Text>
        )}
        {rationales.map((r) => (
          <View key={r.asset} wrap={false}>
            <Text style={styles.rationaleTitle}>{r.title}</Text>
            <Text style={styles.p}>{r.rationale}</Text>
          </View>
        ))}

        {optimize.financials && (
          <>
            <Text style={styles.h1}>
              Financial outlook — direct CapEx vs Energy-as-a-Service
            </Text>
            {verdict && <Text style={styles.p}>{verdict}</Text>}
            <View style={[styles.table, { maxWidth: 360 }]}>
              <View style={styles.row}>
                <Text style={styles.cellBold}>Net CapEx (after incentives)</Text>
                <Text style={styles.cell}>
                  {usd(optimize.financials.capex_net_usd)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.cellBold}>Year-1 savings</Text>
                <Text style={styles.cell}>
                  {usd(optimize.financials.annual_savings_yr1_usd)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.cellBold}>NPV — direct CapEx</Text>
                <Text style={styles.cell}>
                  {usd(optimize.financials.npv_usd)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.cellBold}>NPV — EaaS customer benefit</Text>
                <Text style={styles.cell}>
                  {usd(optimize.financials.eaas_npv_customer_benefit_usd)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.cellBold}>Simple payback</Text>
                <Text style={styles.cell}>
                  {optimize.financials.simple_payback_years !== null
                    ? `${optimize.financials.simple_payback_years.toFixed(1)} yr`
                    : "—"}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.cellBold}>EaaS annual fee (year 1)</Text>
                <Text style={styles.cell}>
                  {usd(optimize.financials.eaas_annual_fee_yr1_usd)}
                </Text>
              </View>
            </View>
          </>
        )}

        <Text style={styles.h1}>Emissions trajectory</Text>
        <View style={[styles.table, { maxWidth: 300 }]}>
          {optimize.emissions_trajectory.map((y) => {
            const total = y.scope1_tco2e + y.scope2_tco2e;
            const pct =
              (1 - total / Math.max(1e-9, optimize.baseline_total_tco2e)) * 100;
            return (
              <View key={y.year} style={styles.row}>
                <Text style={styles.cellBold}>Year {y.year}</Text>
                <Text style={styles.cell}>
                  {total.toFixed(1)} tCO₂e ({pct > 0 ? "-" : "+"}
                  {Math.abs(pct).toFixed(0)}% vs baseline)
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.h1}>Climate resilience</Text>
        {resilienceLines.map((line, i) => (
          <Text key={i} style={styles.p}>
            {line}
          </Text>
        ))}

        <Text style={styles.footnote}>{provenanceNote()}</Text>
      </Page>
    </Document>
  );
}
