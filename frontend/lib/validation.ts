import type { FacilityInput, ScenarioConfig } from "./types";

// Mirrors backend/engine/models.py validation rules exactly.
export function validateFacility(f: FacilityInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const zip = f.zip_code ?? "";
  if (!/^\d{5}$/.test(zip)) {
    errors.zip_code = "ZIP must be exactly 5 digits";
  }
  const area = f.floor_area_sqft;
  if (
    typeof area !== "number" ||
    Number.isNaN(area) ||
    area <= 500 ||
    area > 5_000_000
  ) {
    errors.floor_area_sqft = "Floor area must be between 500 and 5,000,000 sqft";
  }
  return errors;
}

export function validateScenario(s: ScenarioConfig): Record<string, string> {
  const errors: Record<string, string> = {};
  if (s.objective === "target_co2") {
    const t = s.co2_reduction_target_pct;
    if (
      t === null ||
      t === undefined ||
      typeof t !== "number" ||
      Number.isNaN(t) ||
      t < 1 ||
      t > 100
    ) {
      errors.co2_reduction_target_pct =
        "Target must be between 1 and 100 percent";
    }
  }
  return errors;
}
