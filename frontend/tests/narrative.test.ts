import { describe, expect, it } from "vitest";

import {
  assetRationales,
  baselineSummary,
  financialVerdict,
  provenanceNote,
  resilienceNarrative,
  targetVerdict,
} from "@/lib/pdf/narrative";
import { METHOD_ENTRIES } from "@/lib/methodology";
import { minBaseline, minOptimize, minResilience } from "./helpers";

import type { FacilityInput, OptimizeResponse } from "@/lib/types";

const facility: FacilityInput = {
  zip_code: "94105",
  building_type: "office",
  floor_area_sqft: 50000,
};

describe("assetRationales", () => {
  it("produces one rationale per selected asset", () => {
    const out = assetRationales(facility, minOptimize());
    const assets = out.map((r) => r.asset);
    expect(assets).toEqual(["pv", "bess", "heat_pump"]);
    expect(out[0].rationale).toMatch(/mixed dry marine/);
    for (const r of out) {
      expect(r.rationale.length).toBeGreaterThan(40);
    }
  });

  it("mentions PV size in kW and BESS peak reduction", () => {
    const out = assetRationales(facility, minOptimize());
    expect(out[0].rationale).toContain("500 kW");
    expect(out[1].rationale).toContain("60 kW"); // peak_kw_after
  });

  it("falls back to a no-assets explanation when sizing is null", () => {
    const optimize = { ...minOptimize(), sizing: null, financials: null };
    const out = assetRationales(facility, optimize);
    expect(out).toHaveLength(1);
    expect(out[0].asset).toBe("none");
  });

  it("omits heat pump rationale when hp_fraction is 0", () => {
    const optimize: OptimizeResponse = {
      ...minOptimize(),
      sizing: { ...minOptimize().sizing!, hp_fraction: 0, hp_capacity_tons: 0 },
    };
    const assets = assetRationales(facility, optimize).map((r) => r.asset);
    expect(assets).not.toContain("heat_pump");
  });
});

describe("financialVerdict", () => {
  it("recommends EaaS when its NPV is higher", () => {
    const text = financialVerdict(minOptimize())!;
    expect(text).toMatch(/Energy-as-a-Service delivers the higher customer NPV/);
    expect(text).toContain("$68000".replace(/(\d)(?=(\d{3})+$)/g, "$1,")); // fee formatted
  });

  it("recommends CapEx when its NPV is higher and includes payback", () => {
    const optimize = minOptimize();
    optimize.financials!.npv_usd = 300000;
    optimize.financials!.eaas_npv_customer_benefit_usd = 100000;
    const text = financialVerdict(optimize)!;
    expect(text).toMatch(/Direct CapEx delivers the higher customer NPV/);
    expect(text).toContain("7.4 years");
  });

  it("returns null when no financials", () => {
    expect(financialVerdict({ ...minOptimize(), financials: null })).toBeNull();
  });
});

describe("targetVerdict", () => {
  it("is null for max_npv mode", () => {
    expect(targetVerdict(minOptimize())).toBeNull();
  });

  it("affirms met targets in target_co2 mode", () => {
    const optimize = { ...minOptimize(), objective_mode: "target_co2" as const, target_met: true };
    expect(targetVerdict(optimize)).toMatch(/target is met/);
  });

  it("explains unmet targets in target_co2 mode", () => {
    const optimize = { ...minOptimize(), objective_mode: "target_co2" as const, target_met: false };
    expect(targetVerdict(optimize)).toMatch(/could not be met/);
  });
});

describe("resilienceNarrative", () => {
  it("reports before/after and the top hazard with mitigations", () => {
    const lines = resilienceNarrative(minResilience());
    expect(lines[0]).toContain("58");
    expect(lines[0]).toContain("41");
    expect(lines[1]).toMatch(/wildfire/); // highest before score (90)
    expect(lines[1]).toContain("z");
  });
});

describe("baselineSummary / provenanceNote", () => {
  it("summarizes facility, emissions and spend", () => {
    const text = baselineSummary(facility, minBaseline());
    expect(text).toContain("94105");
    expect(text).toContain("~196 tCO₂e");
    expect(text).toContain("office");
  });

  it("provenance note discloses synthetic weather and disclaims investment grade", () => {
    const note = provenanceNote();
    expect(note).toMatch(/CBECS/);
    expect(note).toMatch(/eGRID2022/);
    expect(note).toMatch(/not investment-grade/);
  });
});

describe("methodology data integrity", () => {
  it("has unique ids and valid categories", () => {
    const ids = METHOD_ENTRIES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of METHOD_ENTRIES) {
      expect(m.description.length).toBeGreaterThan(30);
      expect(m.source.length).toBeGreaterThan(3);
    }
  });

  it("only uses https urls", () => {
    for (const m of METHOD_ENTRIES) {
      if (m.url) expect(m.url.startsWith("https://")).toBe(true);
    }
  });
});
