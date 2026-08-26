# DBO Prototype — Frontend Wizard Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the DBO prototype wizard UI: a five-step Next.js (App Router) flow — Facility → Baseline → Scenario → Results → Summary — consuming the stateless FastAPI contract produced by Plan 1 (`2026-08-26-backend-engine-api.md`). Client-side state via zustand, charts via ECharts, client-side CSV export. Must run fully offline in mock mode against committed fixtures so UI work is never blocked on the backend being reachable.

**Architecture:** New `frontend/` directory (App Router). Wizard routes live under `app/wizard/{facility,baseline,scenario,results,summary}`; a zustand store (`store/wizard.ts`) holds facility, scenario, and all fetched results, so step navigation never re-POSTs. A thin typed API client (`lib/api.ts`) POSTs full inputs per step against `NEXT_PUBLIC_API_BASE` (default `http://localhost:8000`, already CORS-allowlisted). `NEXT_PUBLIC_USE_MOCKS=1` swaps the client for a fixture-backed mock with simulated latency. All types in `lib/types.ts` mirror `backend/engine/models.py` field-for-field (hand-maintained; no codegen in v1). Chart options are built by pure functions in `lib/chartOptions.ts` so they are unit-testable without a DOM.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript 5, Tailwind CSS 4, echarts 5 (via a thin `EChart` wrapper component), zustand 5. Tests: Vitest + React Testing Library (unit), Playwright (one happy-path e2e). Node 20+, npm.

**Deviation from spec file list:** the spec sketched only a `frontend/` directory; the concrete layout is defined in the tasks below. PDF export remains deferred (CSV only, per spec §5). The spec's "optional Playwright happy-path test later" is pulled into v1 as a single e2e (Task 9). One real gap surfaced during planning: the results dashboard's **dispatch heatmap** needs hourly series that the Plan-1 `OptimizeResponse` contract does not expose — the engine already computes them (`DispatchResult.import_kw/export_kw/soc_kwh`), so Task 1 extends the response model with plumbing only, before any UI work.

## Global Constraints

- All frontend commands run from `frontend/` unless stated. Install deps once: `cd frontend && npm install`.
- The API base URL comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:8000`); backend CORS already allows `http://localhost:3000`.
- Wizard is client-side only: every step POSTs full inputs (stateless contract). The zustand store is the single source of truth; nothing is persisted server-side; refresh restarts the wizard (acceptable for a prototype).
- `lib/types.ts` mirrors `backend/engine/models.py` field-for-field — names and types are contractual. When the backend model changes, update `lib/types.ts` and the fixtures in the same commit.
- Client-side validation mirrors backend rules before any POST: ZIP `^\d{5}$`, floor area `500 < sqft ≤ 5_000_000`, target `1 ≤ pct ≤ 100`. Format is checked client-side; ZIP *resolution* happens on POST (an `UnsupportedZip` arrives as an RFC 7807 problem response and surfaces as a step-level error banner).
- Mock mode: `NEXT_PUBLIC_USE_MOCKS=1` routes `lib/api.ts` through committed fixtures in `frontend/fixtures/` with ~200 ms simulated latency. Mock and live modes never mix within one request. Fixtures carry `{"meta": {"source": "captured from backend <sha>"}}` so contract drift is visible.
- RFC 7807 `application/problem+json` responses are normalized into `ApiError` with `title`/`detail` and rendered as wizard error banners; the affected step stays re-submittable (retry allowed).
- Hourly series are 8760 floats each — only aggregate what each chart needs; heatmaps aggregate to 12×24 (month × hour). Never render 8760-point raw lines.
- Labels (building types, demo ZIPs, finance assumptions) are fetched from `/reference` endpoints — never hardcoded in components.
- Number formatting lives in `lib/format.ts` (USD, kWh, MMBtu, tCO₂e, years). US units throughout.

---

### Task 1: Extend `OptimizeResponse` with hourly dispatch series (contract gap)

**Files:**
- Modify: `backend/engine/models.py` (add three fields to `OptimizeResponse`)
- Modify: `backend/app/api/v1/optimize.py` (plumb `DispatchResult` hourly arrays)
- Test: extend `backend/tests/test_api_optimize.py`

**Interfaces:**
- Adds to `OptimizeResponse` (all length 8760, flat lists matching `BaselineResponse` style):

```python
hourly_import_kw: list[float]      # grid import kW after assets
hourly_export_kw: list[float]      # export to grid kW
hourly_bess_soc_kwh: list[float]   # battery state of charge kWh
```

- Values come directly from `engine.optimizer.DispatchResult` (`import_kw`, `export_kw`, `soc_kwh`) — already computed by the LP; **no engine changes**.
- When `sizing is None` (do-nothing is optimal), all three arrays are all-zero — consistent with `dispatch` summarizing a no-op.

- [ ] **Step 1: Write failing test**

Extend `backend/tests/test_api_optimize.py` with:

```python
def test_optimize_response_includes_hourly_dispatch():
    # post a max_npv optimize request (use the existing client fixture/pattern)
    r = ...
    assert len(r["hourly_import_kw"]) == 8760
    assert len(r["hourly_export_kw"]) == 8760
    assert len(r["hourly_bess_soc_kwh"]) == 8760
    assert sum(r["hourly_export_kw"]) == pytest.approx(r["dispatch"]["annual_export_kwh"])


def test_do_nothing_optimal_returns_zero_hourly_series():
    # force a scenario where sizing is None (e.g. all asset toggles off)
    r = ...
    assert r["sizing"] is None
    assert set(r["hourly_import_kw"]) == {0.0}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_api_optimize.py -v`
Expected: FAIL — the new keys are absent from the response (extra fields not serialized).

- [ ] **Step 3: Implement**

Add the three fields to `OptimizeResponse` in `backend/engine/models.py`. In `backend/app/api/v1/optimize.py`, build the arrays from `d.import_kw`, `d.export_kw`, `d.soc_kwh` (`[float(x) for x in arr]`); when `sizing is None`, pass zero-filled lists of length 8760.

- [ ] **Step 4: Run full backend suite**

Run: `cd backend && python -m pytest -v`
Expected: PASS (all prior suites stay green).

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(api): hourly dispatch series on optimize response"
```

---

### Task 2: Scaffold Next.js app + typed API client + mock mode

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.ts`, `frontend/postcss.config.mjs`, `frontend/.gitignore`, `frontend/.env.local.example`
- Create: `frontend/app/layout.tsx`, `frontend/app/page.tsx` (redirect to `/wizard/facility`)
- Create: `frontend/lib/types.ts`, `frontend/lib/api.ts`, `frontend/lib/mock.ts`, `frontend/lib/errors.ts`
- Create: `frontend/fixtures/` (baseline / optimize / resilience / reference samples)
- Test: `frontend/tests/api.test.ts`

**Interfaces:**

`lib/types.ts` — mirrors `engine/models.py` exactly (hand-maintained). Enums as string-literal unions: `BuildingType`, `Vintage`, `ObjectiveMode`. Exports `BaselineRequest`, `BaselineResponse`, `ScenarioConfig`, `AssetToggles`, `OptimizeRequest`, `OptimizeResponse` (including the new hourly fields), `ResilienceRequest`, `ResilienceResponse`, plus reference types:

```ts
interface ReferenceBuildingType { value: BuildingType; label: string }
interface ReferenceDemoZip { zip: string; label: string }
interface ReferenceAssumptions {
  pv_usd_per_kw: number; bess_usd_per_kwh: number; hp_usd_per_ton: number
  itc_rate: number; discount_rate: number; utility_escalation: number
  eaas_fee_share: number; analysis_years: number
  gas_kgco2e_per_mmbtu: number; provenance: string
}
interface Problem { type: string; title: string; status: number; detail: string }
```

`lib/errors.ts`:

```ts
export class ApiError extends Error {
  constructor(public readonly problem: Problem) { super(problem.detail || problem.title) }
}
export function isProblem(payload: unknown): payload is Problem
```

`lib/api.ts`:

```ts
export interface ApiClient {
  getBuildingTypes(): Promise<ReferenceBuildingType[]>
  getDemoZips(): Promise<ReferenceDemoZip[]>
  getAssumptions(): Promise<ReferenceAssumptions>
  postBaseline(req: BaselineRequest): Promise<BaselineResponse>
  postOptimize(req: OptimizeRequest): Promise<OptimizeResponse>
  postResilience(req: ResilienceRequest): Promise<ResilienceResponse>
}
export function createApiClient(baseUrl: string, useMocks: boolean): ApiClient
```

- Live client: `fetch` with `Content-Type: application/json`; non-2xx responses are parsed as `Problem` (fallback to a synthesized problem when the body is not RFC 7807) and thrown as `ApiError`.
- `lib/mock.ts` exports `createMockClient(): ApiClient` — resolves fixtures by `(endpoint, building_type, zip)` with ~200 ms latency, and validates the *request* against the fixture's expected shape so mock mode catches contract drift.

Fixture layout (each with a `meta.source` header noting the backend commit it was captured from):

```text
frontend/fixtures/
├── baseline-office-94105.json
├── optimize-office-94105-maxnpv.json
├── optimize-office-94105-targetco2-nosizing.json
├── resilience-hospital-94105.json
└── reference.json
```

Capture procedure (run after Task 1 lands): start `uvicorn app.main:create_app --factory --port 8000` from `backend/`, then curl each endpoint (requests matching the smoke script patterns in Plan 1 Task 15) into the fixture files, adding the `meta` header.

`.env.local.example`:

```text
NEXT_PUBLIC_API_BASE=http://localhost:8000
NEXT_PUBLIC_USE_MOCKS=1
```

- [ ] **Step 1: Write package/config files**

Hand-write `package.json` (deps: `next`, `react`, `react-dom`, `echarts`, `zustand`, `tailwindcss`, `@tailwindcss/postcss`; dev: `typescript`, `@types/react`, `@types/react-dom`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `playwright`), `tsconfig.json`, `next.config.ts`, `postcss.config.mjs` (Tailwind v4 via `@tailwindcss/postcss`), `.gitignore` (node_modules, `.next`, `coverage`, `playwright-report`, `.env.local`), `.env.local.example`. Add npm scripts: `dev`, `build`, `start`, `test` (vitest run), `e2e` (playwright test).

- [ ] **Step 2: Write failing test**

Create `frontend/tests/api.test.ts`:

```text
# 1. createApiClient("http://x", true) -> postBaseline({zip "94105", office, 50000})
#    resolves to a BaselineResponse with the exact field set (assert key presence),
#    and total_tco2e === scope1 + scope2.
# 2. createApiClient("http://x", false) with a stubbed global.fetch that returns
#    a 422 problem+json body -> rejects with ApiError whose .problem.status === 422
#    and message contains the detail string.
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement**

Create `lib/types.ts`, `lib/errors.ts`, `lib/api.ts`, `lib/mock.ts`, `app/layout.tsx` (metadata, fonts, `lang="en"`), `app/page.tsx` (`redirect("/wizard/facility")`). Create the five fixture files (capture from the running backend; if the backend is unreachable, author them by hand from `backend/tests/golden/*` + `engine/models.py`, and mark `meta.source: "hand-authored — verify against live backend"`).

- [ ] **Step 5: Run tests + build**

Run: `cd frontend && npm test && npm run build`
Expected: PASS (1 passed) + successful production build.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(frontend): Next.js scaffold with typed API client and mock mode"
```

---

### Task 3: zustand wizard store + step shell/navigation

**Files:**
- Create: `frontend/store/wizard.ts`
- Create: `frontend/components/wizard/StepIndicator.tsx`, `frontend/components/wizard/WizardNav.tsx`, `frontend/app/wizard/layout.tsx`
- Test: `frontend/tests/store.test.ts`

**Interfaces:**

```ts
type StepId = "facility" | "baseline" | "scenario" | "results" | "summary"

interface WizardState {
  facility: FacilityInput | null
  scenario: ScenarioConfig
  baseline: BaselineResponse | null
  optimize: OptimizeResponse | null
  resilience: ResilienceResponse | null
  activeStep: StepId
  loading: StepId | null          // which step is mid-request
  error: Problem | null
  setFacility(f: FacilityInput): void
  setScenario(s: ScenarioConfig): void
  runBaseline(): Promise<void>    // posts facility → stores baseline
  runOptimize(): Promise<void>    // posts facility+scenario → stores optimize
  runResilience(): Promise<void>  // posts facility+portfolio → stores resilience
  setActiveStep(s: StepId): void
  reset(): void                   // back to a clean facility step
}
```

- `scenario` default: `{ objective: "max_npv", co2_reduction_target_pct: null, assets: { pv: true, bess: true, heat_pump: true } }`.
- Navigation guard in `WizardNav`: each step is enabled only when its prerequisite data exists — baseline needs `facility`, scenario needs `baseline`, results needs `scenario` (facility too), summary needs `optimize` and `resilience`. Back navigation is always allowed; forward navigation re-runs nothing automatically (results step re-runs on mount — see Task 7).
- `runOptimize` and `runResilience` are independent so the results step can run them with `Promise.all` and recover from partial failure; `loading`/`error` are per-step.

- [ ] **Step 1: Write failing store tests**

Create `frontend/tests/store.test.ts`:

```text
# 1. setFacility then runBaseline: loading === "baseline" during, baseline set and
#    loading null after; error set when the client rejects (inject a failing client).
# 2. setScenario merges partial updates (toggling one asset preserves the others).
# 3. reset() clears facility/baseline/optimize/resilience and returns activeStep to facility.
# 4. WizardNav gating: with no facility, baseline forward-nav is disabled; with facility,
#    it is enabled.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — store module missing.

- [ ] **Step 3: Implement**

Create `store/wizard.ts` (zustand `create` + actions; the store holds an `ApiClient` obtained from `createApiClient(env...)` so tests can inject a stub). Create `StepIndicator` (numbered rail), `WizardNav` (prev/next + guard logic), and `app/wizard/layout.tsx` composing them around `{children}` with the step titles: Facility, Baseline, Scenario, Results, Summary.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): zustand wizard store and step shell"
```

---

### Task 4: Facility step

**Files:**
- Create: `frontend/app/wizard/facility/page.tsx`
- Create: `frontend/components/inputs/ZipLookup.tsx`, `frontend/components/inputs/BuildingTypeCards.tsx`, `frontend/components/inputs/FloorAreaInput.tsx`, `frontend/components/inputs/VintageSelect.tsx`
- Create: `frontend/lib/validation.ts`, `frontend/lib/format.ts`
- Test: `frontend/tests/validation.test.ts`

**Interfaces:**

`lib/validation.ts`:

```ts
export function validateFacility(f: FacilityInput): Record<string, string>  // field → message; empty when valid
export function validateScenario(s: ScenarioConfig): Record<string, string>
```

Rules mirror the backend exactly: ZIP `^\d{5}$`; floor area `500 < sqft ≤ 5_000_000`; when `objective === "target_co2"`, `co2_reduction_target_pct` must be within `[1, 100]`. Return empty object when valid.

`lib/format.ts`: `formatUsd(n)`, `formatKwh(n)`, `formatMmbtu(n)`, `formatTco2e(n)`, `formatKw(n)` — compact, thousands-separated.

- `ZipLookup`: text input (maxLength 5) + demo-ZIP quick-pick chips fetched from `getDemoZips()`; selecting a chip fills the input. Labels come from the API, never hardcoded.
- `BuildingTypeCards`: six selectable cards from `getBuildingTypes()` (value + label), single-select, defaulting to `office`.
- `FloorAreaInput`: numeric input with sqft suffix; `VintageSelect`: optional select — "Pre-1980", "1980–2004" (default when unset), "Post-2004" — sent as `vintage` only when chosen.
- Step Next is enabled only when `validateFacility` returns no errors. Submitting stores via `setFacility` and advances.

- [ ] **Step 1: Write failing validation tests**

Create `frontend/tests/validation.test.ts`: bad ZIP (`9410`, `abcde`), floor area 100 and 5_000_001, valid pair yields `{}`, target 0/101 rejected only in `target_co2` mode.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `lib/validation.ts`, `lib/format.ts`, and the four input components + `app/wizard/facility/page.tsx` (fetch reference data on mount; render error banner if `store.error` is set, e.g. an `UnsupportedZip` problem from a previous submit).

- [ ] **Step 4: Run tests + build + manual smoke**

Run: `cd frontend && npm test && npm run build`
Then `npm run dev` with `NEXT_PUBLIC_USE_MOCKS=1` — confirm chips populate, cards select, Next stays disabled on bad input.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): facility step with ZIP lookup and building-type cards"
```

---

### Task 5: Baseline step

**Files:**
- Create: `frontend/app/wizard/baseline/page.tsx`
- Create: `frontend/components/charts/EChart.tsx`, `frontend/components/charts/EmissionsDonut.tsx`, `frontend/components/charts/CostBreakdown.tsx`, `frontend/components/charts/MonthlyLoadChart.tsx`
- Create: `frontend/components/results/MetricCard.tsx`
- Create: `frontend/lib/chartOptions.ts`
- Test: `frontend/tests/chartOptions.test.ts`

**Interfaces:**

`EChart` wrapper:

```tsx
export function EChart({ option, height = 320, ariaLabel }: {
  option: EChartsOption; height?: number; ariaLabel?: string
}): JSX.Element
```

Mounts once, calls `setOption` on `option` change, disposes on unmount, sets `aria-label` + `role="img"`, and disables animation when the user prefers reduced motion.

`lib/chartOptions.ts` (pure builders, unit-testable):

```ts
export function emissionsDonutOption(b: BaselineResponse): EChartsOption   // scope1 vs scope2 tCO₂e
export function costBreakdownOption(b: BaselineResponse): EChartsOption    // electricity/demand/gas bars
export function monthlyLoadOption(b: BaselineResponse): EChartsOption      // 12 months, dual axis kWh + MMBtu
```

- Step page on mount: if no `baseline` yet, call `store.runBaseline()` (auto-runs on arrival with a valid facility); render `MetricCard`s (annual kWh, annual MMBtu, total tCO₂e, peak kW, total spend/yr), the emissions donut, cost breakdown, and monthly load chart, plus a `data_provenance` footnote (honesty note from the API).

- [ ] **Step 1: Write failing chart-option tests**

Create `frontend/tests/chartOptions.test.ts`: donut series data maps `scope1_tco2e`/`scope2_tco2e` with correct labels; monthly option has exactly 12 x-axis points; cost breakdown sums to `spend.total_usd`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `lib/chartOptions.ts`, `EChart.tsx`, the three chart components, `MetricCard.tsx`, and `app/wizard/baseline/page.tsx`.

- [ ] **Step 4: Run tests + build + manual smoke**

Run: `cd frontend && npm test && npm run build`
Then `npm run dev` (mock mode) — walk facility → baseline, confirm donut/breakdown/monthly render and the provenance footnote shows.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): baseline step with emissions, spend, and load charts"
```

---

### Task 6: Scenario step

**Files:**
- Create: `frontend/app/wizard/scenario/page.tsx`
- Create: `frontend/components/inputs/AssetToggles.tsx`, `frontend/components/inputs/ObjectiveSelector.tsx`, `frontend/components/inputs/TargetSlider.tsx`
- Create: `frontend/components/results/AssumptionsPanel.tsx`
- Test: extend `frontend/tests/validation.test.ts`

**Interfaces:**

- `ObjectiveSelector`: two cards — "Maximize NPV" (`max_npv`) and "Meet decarbonization target" (`target_co2`).
- `TargetSlider`: range 5–100, step 5, labeled `co2_reduction_target_pct`, visible only when `objective === "target_co2"`; initializes to 40 when the mode is first selected; sends `null` in `max_npv` mode.
- `AssetToggles`: three switches mapping to `scenario.assets.{pv,bess,heat_pump}`, all default on; descriptions — "Solar PV", "Battery storage (BESS)", "Heat pump electrification".
- `AssumptionsPanel`: read-only table from `getAssumptions()` (PV $/kW, BESS $/kWh, HP $/ton, ITC, discount rate, utility escalation, EaaS fee share, analysis years), labeled "Model assumptions (prototype)".
- Step Next enabled when `validateScenario` passes (i.e. always in `max_npv`; target in range in `target_co2`). Store updates via `setScenario`.

- [ ] **Step 1: Extend validation tests**

Add cases: `{ objective: "target_co2", co2_reduction_target_pct: 101 }` rejected; `target_co2` with `null` target rejected; `max_npv` with any target value accepted.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — `validateScenario` missing.

- [ ] **Step 3: Implement**

Extend `lib/validation.ts` with `validateScenario`; create the four components + `app/wizard/scenario/page.tsx` (fetch assumptions on mount).

- [ ] **Step 4: Run tests + build + manual smoke**

Run: `cd frontend && npm test && npm run build`
Then `npm run dev` (mock mode) — toggle assets, switch objective, confirm slider appears and the assumptions panel fills.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): scenario step with objective, target slider, asset toggles"
```

---

### Task 7: Results dashboard step

**Files:**
- Create: `frontend/app/wizard/results/page.tsx`
- Create: `frontend/components/charts/DispatchHeatmap.tsx`, `frontend/components/charts/CashflowChart.tsx`, `frontend/components/charts/EmissionsTrajectoryChart.tsx`, `frontend/components/charts/ResilienceRadar.tsx`
- Create: `frontend/components/results/SizingCard.tsx`, `frontend/components/results/FinancialComparison.tsx`, `frontend/components/results/ResilienceCard.tsx`, `frontend/components/results/TargetBanner.tsx`
- Test: extend `frontend/tests/chartOptions.test.ts`

**Interfaces:**

On mount (facility + scenario present): `Promise.all([runOptimize(), runResilience()])`. Both must succeed for the full dashboard; if one fails, render that panel's error banner with a retry button while the other renders normally.

New `lib/chartOptions.ts` builders:

```ts
export function dispatchHeatmapOption(imp: number[]): EChartsOption     // 12×24 month×hour grid-import kW
export function bessSocHeatmapOption(soc: number[]): EChartsOption      // 12×24 month×hour battery kWh
export function cashflowOption(f: FinancialSummary): EChartsOption      // cumulative CapEx vs EaaS lines
export function emissionsTrajectoryOption(o: OptimizeResponse): EChartsOption
                                                                        // scope1+scope2/yr line + baseline total reference line
export function resilienceRadarOption(r: ResilienceResponse): EChartsOption
                                                                        // five hazards, before vs after series
```

- `DispatchHeatmap`: ECharts heatmap, 12 rows (month) × 24 columns (hour), aggregated from `hourly_import_kw` via `lib/chartOptions.ts` helpers; a toggle switches between grid import and `hourly_bess_soc_kwh`. When `sizing` is `null`, render a "No assets recommended — keeping current operations is optimal" panel instead of the heatmaps.
- `CashflowChart`: cumulative CapEx vs EaaS net cashflow from `financials.capex_cashflow` / `financials.eaas_net_cashflow` (year 0 = index 0).
- `EmissionsTrajectoryChart`: per-year scope1+scope2 with a flat reference line at `baseline_total_tco2e`.
- `ResilienceRadar`: the five `hazards` before vs after.
- `SizingCard`: PV kW, BESS kWh/kW, HP tons + `hp_fraction`. `FinancialComparison`: table comparing Direct CapEx (capex net, NPV, IRR, simple payback) vs EaaS (year-1 fee, NPV customer benefit). `TargetBanner`: in `target_co2` mode, "Target met" / "Target not met" from `target_met`.
- `unmet_hours > 0` renders a warning chip: "LP used load-shed slack for N hours" (honesty per Plan 1).

- [ ] **Step 1: Write failing chart-option tests**

Extend `frontend/tests/chartOptions.test.ts`: heatmap data array length is 288 (12×24) and sums to the annual import kWh; cashflow option has `analysis_years + 1` x points; trajectory includes the baseline reference series; radar has two series with five axes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — builders missing.

- [ ] **Step 3: Implement**

Extend `lib/chartOptions.ts` with the aggregation helpers (month = `Math.floor(hour / 730.5)` bounded to 11) and builders; create the chart/results components and `app/wizard/results/page.tsx`.

- [ ] **Step 4: Run tests + build + manual smoke**

Run: `cd frontend && npm test && npm run build`
Then `npm run dev` (mock mode) — confirm both panels load, heatmap toggle works, and the do-nothing fixture (`optimize-office-94105-targetco2-nosizing.json`) renders the no-assets panel.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): results dashboard with dispatch heatmap and financing comparison"
```

---

### Task 8: Summary step + CSV export

**Files:**
- Create: `frontend/app/wizard/summary/page.tsx`
- Create: `frontend/lib/csv.ts`
- Test: `frontend/tests/csv.test.ts`

**Interfaces:**

```ts
export function summaryCsv(data: { baseline: BaselineResponse; optimize: OptimizeResponse;
                                    resilience: ResilienceResponse }): string
export function downloadCsv(filename: string, csv: string): void
```

- `summaryCsv` emits one CSV with three sections separated by header rows: **Baseline monthly** (month, electricity_kwh, gas_mmbtu), **Emissions trajectory** (year, scope1_tco2e, scope2_tco2e), **Cashflows** (year, capex_cumulative_usd, eaas_cumulative_usd). Values are round-trippable numbers, not pre-formatted strings.
- `downloadCsv` builds a Blob (`text/csv`) and triggers a browser download (`a[download]`).
- Summary page: executive one-pager — facility facts (ZIP, type label, area, vintage), key numbers (baseline tCO₂e, spend; recommended sizing or "no assets"; NPV vs EaaS benefit), a rule-based recommendation sentence, resilience highlights (overall before → after + top hazard deltas), CSV download button, and "Start over" calling `store.reset()`.

- [ ] **Step 1: Write failing CSV test**

Create `frontend/tests/csv.test.ts`: build from a small hand-made `BaselineResponse`/`OptimizeResponse`/`ResilienceResponse`; assert the CSV contains all three section headers, 12 monthly rows, 15 trajectory rows, `analysis_years + 1` cashflow rows, and that a trailing newline is present.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `lib/csv.ts` and `app/wizard/summary/page.tsx`.

- [ ] **Step 4: Run tests + build + manual smoke**

Run: `cd frontend && npm test && npm run build`
Then `npm run dev` (mock mode) — walk the full wizard, download the CSV, open it in a spreadsheet to confirm section layout.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): summary step with executive view and CSV export"
```

---

### Task 9: Happy-path e2e + README + final verification

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/tests/e2e/wizard.spec.ts`
- Modify: `README.md` (repo root — frontend quickstart section)

**Interfaces:**

- `playwright.config.ts`: webServer launches `npm run dev` with `NEXT_PUBLIC_USE_MOCKS=1` (via a `.env.e2e` or env passthrough), baseURL `http://localhost:3000`, chromium only.
- `tests/e2e/wizard.spec.ts`: full happy path in mock mode — pick demo ZIP `94105` (chip click), floor area `50000`, Office card selected, Next → baseline donut visible → Next → scenario defaults accepted → Next → results render dispatch heatmap, cashflow chart, resilience radar → Next → summary shows recommendation text and the CSV button triggers a download event.

- [ ] **Step 1: Write the spec + config**

Create `playwright.config.ts` and `tests/e2e/wizard.spec.ts` as above.

- [ ] **Step 2: Run e2e**

Install the browser once: `cd frontend && npx playwright install chromium`
Run: `cd frontend && npm run e2e`
Expected: PASS — the full wizard walk completes in mock mode.

- [ ] **Step 3: Update README**

Add a **Frontend (wizard)** section to the root `README.md`: install (`cd frontend && npm install`), env setup (copy `.env.local.example`, note `NEXT_PUBLIC_USE_MOCKS=1` for offline dev), run (`npm run dev` → http://localhost:3000), tests (`npm test`, `npm run e2e`), and a pointer to this plan.

- [ ] **Step 4: Full verification**

Run: `cd backend && python -m pytest -v` → PASS.
Run: `cd frontend && npm test && npm run build` → PASS.
Manual cross-check against the **live** backend (no mocks): start `uvicorn app.main:create_app --factory --reload --port 8000` from `backend/` and `npm run dev` from `frontend/` with `NEXT_PUBLIC_USE_MOCKS=0`; walk the wizard once end-to-end with a real ZIP (e.g. 94105) and confirm identical results to mock mode (same numbers, per fixture provenance).

- [ ] **Step 5: Commit**

```bash
git add README.md frontend
git commit -m "feat(frontend): wizard happy-path e2e and README"
```

---

## Plan complete

Plan 1 (`2026-08-26-backend-engine-api.md`) delivered the stateless FastAPI contract; this plan delivers the five-step wizard that consumes it. Together they cover the full v1 scope — baselining, optimization, resilience, and financing comparison presented through the guided wizard UI. Phase 4 items (CRREM stranding curves, embodied carbon ledger, MACC waterfalls, TOU tariffs) remain explicitly out of scope per the design spec.
