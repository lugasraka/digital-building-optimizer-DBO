import type { ApiClient } from "./api";
import type {
  BaselineRequest,
  BaselineResponse,
  OptimizeRequest,
  OptimizeResponse,
  ReferenceAssumptions,
  ReferenceBuildingType,
  ReferenceDemoZip,
  ResilienceRequest,
  ResilienceResponse,
} from "./types";

const LATENCY_MS = 200;

type FixtureWithMeta<T> = T & { meta?: { source: string } };

async function fixture<T>(path: string): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  const resp = await fetch(path);
  if (!resp.ok) {
    throw new Error(`mock fixture missing: ${path} (HTTP ${resp.status})`);
  }
  const data = (await resp.json()) as FixtureWithMeta<T>;
  // Strip the provenance header captured into fixtures before handing to callers.
  const { meta: _meta, ...rest } = data;
  return rest as T;
}

function assetsOff(assets: { pv: boolean; bess: boolean; heat_pump: boolean }): boolean {
  return !assets.pv && !assets.bess && !assets.heat_pump;
}

export function createMockClient(): ApiClient {
  return {
    getBuildingTypes: () =>
      fixture<ReferenceBuildingType[]>("/fixtures/reference.json").then(
        (r) => (r as unknown as { building_types: ReferenceBuildingType[] }).building_types,
      ),
    getDemoZips: () =>
      fixture<ReferenceDemoZip[]>("/fixtures/reference.json").then(
        (r) => (r as unknown as { demo_zips: ReferenceDemoZip[] }).demo_zips,
      ),
    getAssumptions: () =>
      fixture<ReferenceAssumptions>("/fixtures/reference.json").then(
        (r) => (r as unknown as { assumptions: ReferenceAssumptions }).assumptions,
      ),

    postBaseline: (req: BaselineRequest) => {
      const key = `${req.building_type}:${req.zip_code}`;
      const path = `${
        key === "office:94105"
          ? "/fixtures/baseline-office-94105.json"
          : ""
      }`;
      if (!path) {
        throw new Error(
          `mock mode has no baseline fixture for ${key}; add one to frontend/public/fixtures/`,
        );
      }
      return fixture<BaselineResponse>(path);
    },

    postOptimize: (req: OptimizeRequest) => {
      const { building_type, zip_code } = req.facility;
      const { objective } = req.scenario;
      // Mirror the backend default: ScenarioConfig.assets defaults to all-on.
      const assets = req.scenario.assets ?? { pv: true, bess: true, heat_pump: true };
      const key = `${building_type}:${zip_code}:${objective}:${
        assetsOff(assets) ? "off" : "on"
      }`;
      let path = "";
      if (key === "office:94105:max_npv:off") {
        path = "/fixtures/optimize-office-94105-maxnpv-nosizing.json";
      } else if (key === "office:94105:target_co2:on") {
        path = "/fixtures/optimize-office-94105-targetco2.json";
      } else if (key === "office:94105:max_npv:on") {
        path = "/fixtures/optimize-office-94105-maxnpv.json";
      }
      if (!path) {
        throw new Error(
          `mock mode has no optimize fixture for ${key}; add one to frontend/public/fixtures/`,
        );
      }
      return fixture<OptimizeResponse>(path);
    },

    postResilience: (req: ResilienceRequest) => {
      const key = `${req.building_type}:${req.zip_code}`;
      const path = `${
        key === "hospital:94105"
          ? "/fixtures/resilience-hospital-94105.json"
          : ""
      }`;
      if (!path) {
        throw new Error(
          `mock mode has no resilience fixture for ${key}; add one to frontend/public/fixtures/`,
        );
      }
      return fixture<ResilienceResponse>(path);
    },
  };
}
