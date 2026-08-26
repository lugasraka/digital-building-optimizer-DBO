import { ApiError, isProblem } from "./errors";
import { createMockClient } from "./mock";

export { ApiError, isProblem } from "./errors";
import type {
  BaselineRequest,
  BaselineResponse,
  OptimizeRequest,
  OptimizeResponse,
  Problem,
  ReferenceAssumptions,
  ReferenceBuildingType,
  ReferenceDemoZip,
  ResilienceRequest,
  ResilienceResponse,
} from "./types";

export interface ApiClient {
  getBuildingTypes(): Promise<ReferenceBuildingType[]>;
  getDemoZips(): Promise<ReferenceDemoZip[]>;
  getAssumptions(): Promise<ReferenceAssumptions>;
  postBaseline(req: BaselineRequest): Promise<BaselineResponse>;
  postOptimize(req: OptimizeRequest): Promise<OptimizeResponse>;
  postResilience(req: ResilienceRequest): Promise<ResilienceResponse>;
}

function fallbackProblem(status: number): Problem {
  return {
    type: "about:blank",
    title: `Request failed (${status})`,
    status,
    detail: `HTTP ${status}`,
  };
}

async function parse<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let problem: Problem;
    try {
      const payload: unknown = await resp.json();
      problem = isProblem(payload) ? payload : fallbackProblem(resp.status);
    } catch {
      problem = fallbackProblem(resp.status);
    }
    throw new ApiError(problem);
  }
  return (await resp.json()) as T;
}

function postJson(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Shared client factory reading the standard NEXT_PUBLIC_* env vars.
export function getApiClient(): ApiClient {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "1";
  return createApiClient(baseUrl, useMocks);
}

export function createApiClient(baseUrl: string, useMocks: boolean): ApiClient {
  if (useMocks) {
    return createMockClient();
  }
  const base = baseUrl.replace(/\/$/, "");
  return {
    getBuildingTypes: () =>
      fetch(`${base}/api/v1/reference/building-types`).then((r) =>
        parse<ReferenceBuildingType[]>(r),
      ),
    getDemoZips: () =>
      fetch(`${base}/api/v1/reference/demo-zips`).then((r) =>
        parse<ReferenceDemoZip[]>(r),
      ),
    getAssumptions: () =>
      fetch(`${base}/api/v1/reference/assumptions`).then((r) =>
        parse<ReferenceAssumptions>(r),
      ),
    postBaseline: (req) =>
      fetch(`${base}/api/v1/baseline`, postJson(req)).then((r) =>
        parse<BaselineResponse>(r),
      ),
    postOptimize: (req) =>
      fetch(`${base}/api/v1/optimize`, postJson(req)).then((r) =>
        parse<OptimizeResponse>(r),
      ),
    postResilience: (req) =>
      fetch(`${base}/api/v1/resilience`, postJson(req)).then((r) =>
        parse<ResilienceResponse>(r),
      ),
  };
}
