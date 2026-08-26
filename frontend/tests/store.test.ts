import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiClient } from "@/lib/api";
import { ApiError } from "@/lib/api";
import type {
  BaselineResponse,
  FacilityInput,
  OptimizeResponse,
  Problem,
  ResilienceResponse,
} from "@/lib/types";
import { createWizardStore, type WizardState } from "@/store/wizard";

const VALID_FACILITY: FacilityInput = {
  zip_code: "94105",
  building_type: "office",
  floor_area_sqft: 50000,
};

const PROBLEM: Problem = {
  type: "about:blank",
  title: "Unsupported ZIP code",
  status: 422,
  detail: "ZIP '00000' not in bundled crosswalk",
};

function minBaseline(): BaselineResponse {
  return {
    zip_code: "94105",
    county_fips: "06075",
    county_name: "San Francisco County",
    state: "CA",
    climate_zone_group: "mixed_dry_marine",
    tmy_station_id: "KSFO",
    annual_electricity_kwh: 551250,
    annual_gas_mmbtu: 1209,
    scope1_tco2e: 64.16,
    scope2_tco2e: 132.3,
    total_tco2e: 196.46,
    peak_kw: 84.45,
    spend: {
      electricity_usd: 120000,
      demand_charges_usd: 15121,
      gas_usd: 22973,
      total_usd: 158094,
    },
    monthly: [],
    hourly_electric_kw: [],
    hourly_gas_mmbtu_per_hour: [],
    data_provenance: "synthetic",
  };
}

function stubClient(overrides: Partial<ApiClient> = {}): ApiClient {
  const base: ApiClient = {
    getBuildingTypes: vi.fn(),
    getDemoZips: vi.fn(),
    getAssumptions: vi.fn(),
    postBaseline: vi.fn(),
    postOptimize: vi.fn(),
    postResilience: vi.fn(),
  };
  return { ...base, ...overrides };
}

function createStore(client: ApiClient) {
  return createWizardStore(client);
}

describe("wizard store", () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => {
    store = createStore(stubClient());
  });

  it("runBaseline stores the baseline and clears loading", async () => {
    const postBaseline = vi.fn().mockResolvedValue(minBaseline());
    store = createStore(stubClient({ postBaseline }));
    store.getState().setFacility(VALID_FACILITY);
    await store.getState().runBaseline();
    const s = store.getState();
    expect(s.baseline).toEqual(minBaseline());
    expect(s.loading).toBeNull();
    expect(s.error).toBeNull();
  });

  it("loading is set while the request is in flight", async () => {
    let resolve!: (b: BaselineResponse) => void;
    const postBaseline = vi.fn().mockReturnValue(
      new Promise<BaselineResponse>((r) => {
        resolve = r;
      }),
    );
    store = createStore(stubClient({ postBaseline }));
    store.getState().setFacility(VALID_FACILITY);
    const pending = store.getState().runBaseline();
    expect(store.getState().loading).toBe("baseline");
    resolve(minBaseline());
    await pending;
    expect(store.getState().loading).toBeNull();
  });

  it("surfaces client errors on the baseline step", async () => {
    const postBaseline = vi.fn().mockRejectedValue(new ApiError(PROBLEM));
    store = createStore(stubClient({ postBaseline }));
    store.getState().setFacility({ ...VALID_FACILITY, zip_code: "00000" });
    await store.getState().runBaseline();
    const s = store.getState();
    expect(s.error).toEqual(PROBLEM);
    expect(s.baseline).toBeNull();
    expect(s.loading).toBeNull();
  });

  it("setScenario merges partial updates", () => {
    store.getState().setScenario({ assets: { bess: false } });
    const s = store.getState().scenario;
    expect(s.assets).toEqual({ pv: true, bess: false, heat_pump: true });
    expect(s.objective).toBe("max_npv");
    store.getState().setScenario({ objective: "target_co2", co2_reduction_target_pct: 40 });
    expect(store.getState().scenario.objective).toBe("target_co2");
    expect(store.getState().scenario.co2_reduction_target_pct).toBe(40);
  });

  it("reset clears all results and returns to the facility step", async () => {
    const postBaseline = vi.fn().mockResolvedValue(minBaseline());
    const postOptimize = vi.fn().mockResolvedValue({} as OptimizeResponse);
    const postResilience = vi.fn().mockResolvedValue({} as ResilienceResponse);
    store = createStore(stubClient({ postBaseline, postOptimize, postResilience }));
    store.getState().setFacility(VALID_FACILITY);
    await store.getState().runBaseline();
    await store.getState().runOptimize();
    await store.getState().runResilience();
    store.getState().setActiveStep("summary");
    store.getState().reset();
    const s = store.getState();
    expect(s.facility).toBeNull();
    expect(s.baseline).toBeNull();
    expect(s.optimize).toBeNull();
    expect(s.resilience).toBeNull();
    expect(s.activeStep).toBe("facility");
    expect(s.scenario).toEqual({
      objective: "max_npv",
      co2_reduction_target_pct: null,
      assets: { pv: true, bess: true, heat_pump: true },
    });
  });

  it("canNavigateTo gates forward navigation on prerequisites", () => {
    const s = store.getState() as WizardState;
    expect(s.canNavigateTo("baseline")).toBe(false);
    store.getState().setFacility(VALID_FACILITY);
    expect(store.getState().canNavigateTo("baseline")).toBe(true);
    expect(store.getState().canNavigateTo("scenario")).toBe(false);
  });
});
