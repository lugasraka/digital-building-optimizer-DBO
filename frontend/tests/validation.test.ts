import { describe, expect, it } from "vitest";

import { validateFacility, validateScenario } from "@/lib/validation";

const ASSETS = { pv: true, bess: true, heat_pump: true };

describe("validateFacility", () => {
  it("rejects malformed ZIP codes", () => {
    expect(
      validateFacility({ zip_code: "9410", building_type: "office", floor_area_sqft: 50000 }),
    ).toHaveProperty("zip_code");
    expect(
      validateFacility({ zip_code: "abcde", building_type: "office", floor_area_sqft: 50000 }),
    ).toHaveProperty("zip_code");
    expect(
      validateFacility({ zip_code: "", building_type: "office", floor_area_sqft: 50000 }),
    ).toHaveProperty("zip_code");
  });

  it("rejects out-of-range floor areas", () => {
    expect(
      validateFacility({ zip_code: "94105", building_type: "office", floor_area_sqft: 100 }),
    ).toHaveProperty("floor_area_sqft");
    expect(
      validateFacility({ zip_code: "94105", building_type: "office", floor_area_sqft: 5_000_001 }),
    ).toHaveProperty("floor_area_sqft");
    expect(
      validateFacility({ zip_code: "94105", building_type: "office", floor_area_sqft: 500 }),
    ).toHaveProperty("floor_area_sqft");
  });

  it("accepts a valid facility", () => {
    expect(
      validateFacility({ zip_code: "94105", building_type: "office", floor_area_sqft: 50000 }),
    ).toEqual({});
  });
});

describe("validateScenario", () => {
  it("rejects a missing or out-of-range target in target_co2 mode", () => {
    expect(
      validateScenario({ objective: "target_co2", co2_reduction_target_pct: 101, assets: ASSETS }),
    ).toHaveProperty("co2_reduction_target_pct");
    expect(
      validateScenario({ objective: "target_co2", co2_reduction_target_pct: 0, assets: ASSETS }),
    ).toHaveProperty("co2_reduction_target_pct");
    expect(
      validateScenario({ objective: "target_co2", co2_reduction_target_pct: null, assets: ASSETS }),
    ).toHaveProperty("co2_reduction_target_pct");
  });

  it("accepts target_co2 with a valid target", () => {
    expect(
      validateScenario({ objective: "target_co2", co2_reduction_target_pct: 40, assets: ASSETS }),
    ).toEqual({});
  });

  it("accepts max_npv regardless of target value", () => {
    expect(
      validateScenario({ objective: "max_npv", co2_reduction_target_pct: 101, assets: ASSETS }),
    ).toEqual({});
  });
});
