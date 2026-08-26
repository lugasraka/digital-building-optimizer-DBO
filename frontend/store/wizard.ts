import { create } from "zustand";

import { ApiError, createApiClient } from "@/lib/api";
import type { ApiClient } from "@/lib/api";
import type {
  BaselineResponse,
  FacilityInput,
  OptimizeResponse,
  Problem,
  ResilienceResponse,
  ScenarioConfig,
} from "@/lib/types";
import { validateFacility, validateScenario } from "@/lib/validation";

export type StepId =
  | "facility"
  | "baseline"
  | "scenario"
  | "results"
  | "summary";

export const STEPS: StepId[] = [
  "facility",
  "baseline",
  "scenario",
  "results",
  "summary",
];

export const STEP_TITLES: Record<StepId, string> = {
  facility: "Facility",
  baseline: "Baseline",
  scenario: "Scenario",
  results: "Results",
  summary: "Summary",
};

const DEFAULT_SCENARIO: ScenarioConfig = {
  objective: "max_npv",
  co2_reduction_target_pct: null,
  assets: { pv: true, bess: true, heat_pump: true },
};

function defaultClient(): ApiClient {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "1";
  return createApiClient(baseUrl, useMocks);
}

function toProblem(err: unknown): Problem {
  if (err instanceof ApiError) {
    return err.problem;
  }
  return {
    type: "about:blank",
    title: "Request failed",
    status: 0,
    detail: err instanceof Error ? err.message : String(err),
  };
}

export interface WizardState {
  facility: FacilityInput | null;
  scenario: ScenarioConfig;
  baseline: BaselineResponse | null;
  optimize: OptimizeResponse | null;
  resilience: ResilienceResponse | null;
  activeStep: StepId;
  loading: StepId | null;
  error: Problem | null;
  setFacility: (f: FacilityInput) => void;
  setScenario: (s: Partial<ScenarioConfig>) => void;
  runBaseline: () => Promise<void>;
  runOptimize: () => Promise<void>;
  runResilience: () => Promise<void>;
  setActiveStep: (s: StepId) => void;
  reset: () => void;
  stepComplete: (step: StepId) => boolean;
  canNavigateTo: (target: StepId) => boolean;
}

export function createWizardStore(client: ApiClient = defaultClient()) {
  return create<WizardState>()((set, get) => ({
    facility: null,
    scenario: { ...DEFAULT_SCENARIO },
    baseline: null,
    optimize: null,
    resilience: null,
    activeStep: "facility",
    loading: null,
    error: null,

    setFacility: (facility) => set({ facility, error: null }),

    setScenario: (partial) =>
      set((s) => ({
        scenario: {
          ...s.scenario,
          ...partial,
          assets: partial.assets
            ? { ...s.scenario.assets, ...partial.assets }
            : s.scenario.assets,
        },
        error: null,
      })),

    runBaseline: async () => {
      const { facility } = get();
      if (!facility) return;
      set({ loading: "baseline", error: null });
      try {
        const baseline = await client.postBaseline(facility);
        set({ baseline, loading: null });
      } catch (err) {
        set({ error: toProblem(err), loading: null });
      }
    },

    runOptimize: async () => {
      const { facility, scenario } = get();
      if (!facility) return;
      set({ loading: "results", error: null });
      try {
        const optimize = await client.postOptimize({ facility, scenario });
        set({ optimize, loading: null });
      } catch (err) {
        set({ error: toProblem(err), loading: null });
      }
    },

    runResilience: async () => {
      const { facility } = get();
      if (!facility) return;
      set({ loading: "results", error: null });
      try {
        const resilience = await client.postResilience({
          zip_code: facility.zip_code,
          building_type: facility.building_type,
        });
        set({ resilience, loading: null });
      } catch (err) {
        set({ error: toProblem(err), loading: null });
      }
    },

    setActiveStep: (activeStep) => set({ activeStep, error: null }),

    reset: () =>
      set({
        facility: null,
        scenario: { ...DEFAULT_SCENARIO },
        baseline: null,
        optimize: null,
        resilience: null,
        activeStep: "facility",
        loading: null,
        error: null,
      }),

    stepComplete: (step) => {
      const s = get();
      switch (step) {
        case "facility":
          return (
            s.facility !== null &&
            Object.keys(validateFacility(s.facility)).length === 0
          );
        case "baseline":
          return s.baseline !== null;
        case "scenario":
          return Object.keys(validateScenario(s.scenario)).length === 0;
        case "results":
          return s.optimize !== null && s.resilience !== null;
        case "summary":
          return true;
      }
    },

    canNavigateTo: (target) => {
      const idx = STEPS.indexOf(target);
      if (idx <= STEPS.indexOf(get().activeStep)) {
        // Backwards or same-step navigation is always allowed.
        return true;
      }
      for (let i = 0; i < idx; i++) {
        if (!get().stepComplete(STEPS[i])) {
          return false;
        }
      }
      return true;
    },
  }));
}

export const useWizard = createWizardStore();
