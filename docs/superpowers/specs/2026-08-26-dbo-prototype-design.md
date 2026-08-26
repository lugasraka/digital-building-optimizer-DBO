# DBO Prototype — Design Specification

**Date:** 2026-08-26
**Status:** Approved
**Purpose:** Technical proof-of-concept replicating the core concepts of the Siemens Decarbonization Business Optimizer (DBO™): convert minimal facility inputs into energy/emissions baselines, size and dispatch clean-energy assets, score climate resilience, and compare financing structures — presented through a guided wizard UI.

---

## 1. Requirements Summary

| Dimension | Decision |
|---|---|
| Demo purpose | Technical proof-of-concept — engineering model accuracy prioritized |
| Geography | US only (CBECS, eGRID, ASHRAE climate zones, TMY, FEMA NRI) |
| Reference data | Bundled static datasets; zero network dependency at runtime |
| v1 Scope | Phases 1–3 (baselining, optimization, resilience + finance). Phase 4 items out of scope but architecture must accommodate them |
| Stack | FastAPI backend + Next.js frontend |
| Optimization rigor | scipy LP dispatch + heuristic sizing outer loop (MILP-ready structure, not required in v1) |
| Timeline | Open-ended; high quality bar, extensible toward Phase 4 |

**Non-goals (v1):** CRREM stranding curves, embodied carbon ledger, MACC waterfalls, live external API calls at runtime, multi-region support, authentication/multi-tenancy.

---

## 2. Architecture

Modular monolith (Approach A):

```text
digital-building-optimizer/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app factory, CORS, router mounting
│   │   └── api/v1/
│   │       ├── baseline.py      # POST /api/v1/baseline
│   │       ├── optimize.py      # POST /api/v1/optimize
│   │       ├── resilience.py    # POST /api/v1/resilience
│   │       └── reference.py     # GET dropdown/reference data
│   ├── engine/                  # PURE PYTHON — no web framework imports
│   │   ├── models.py            # Pydantic v2 I/O models (shared contract)
│   │   ├── profiles.py          # Synthetic 8760-hour load generation
│   │   ├── baseline.py          # EUI lookup, emissions, utility spend
│   │   ├── optimizer.py         # Heuristic sizing + scipy LP dispatch
│   │   ├── resilience.py        # Hazard exposure scoring & mitigation match
│   │   └── finance.py           # CapEx, NPV/IRR/payback, EaaS structures
│   ├── data/                    # Bundled compiled datasets (committed)
│   │   ├── eui_benchmarks.json
│   │   ├── grid_factors.json
│   │   ├── climate_zones.json
│   │   ├── tmy_profiles.parquet
│   │   └── hazard_index.json
│   └── tests/
├── data_pipeline/               # Run-once scripts that build backend/data/*
│   ├── fetch_cbecs.py
│   ├── fetch_egrid.py
│   ├── fetch_tmy.py
│   ├── fetch_nri.py
│   └── compile_datasets.py
└── frontend/                    # Next.js (App Router) + Tailwind + ECharts
```

### Key architectural decisions

1. **Engine purity.** `engine/` imports only numpy/pandas/scipy/pydantic — never FastAPI. Pydantic v2 models are shared between engine and API layer (one source of truth, no mapping boilerplate), while keeping the engine extractable into a standalone package later if needed.
2. **Stateless request/response.** Every POST carries full inputs; no server-side sessions. Wizard state lives client-side. Trivially testable, demo-safe.
3. **Data pipeline separation.** `data_pipeline/` scripts download raw public data (CBECS, eGRID, TMY, NRI) and compile the bundled JSON/Parquet artifacts. They are committed for reproducibility but never required at runtime or during demos.
4. **Synchronous endpoints.** An LP over 8760 hours with ~4 dispatchable asset groups solves well under a second with scipy — no background jobs in v1.

### Data curation rules

- **Building types (v1):** Office, Retail (standalone), Warehouse (non-refrigerated), K-12 School, Hospital/Healthcare, Hotel. Six types — all well-covered by CBECS end-use data; manufacturing excluded because process loads defeat the degree-day shape model.
- **Geography resolution:** Any valid 5-digit ZIP accepted. Bundled ZCTA→county crosswalk resolves ZIP → county → climate zone / eGRID subregion / state tariff / NRI scores.
- **TMY stations:** ~25–30 representative stations spanning ASHRAE climate zones; each location binds to its nearest station's hourly temperature/irradiance profile. Keeps `tmy_profiles.parquet` small (~a few MB).
- **Vintage buckets:** Pre-1980, 1980–2004, post-2004 (CBECS-era cohorts) — enough resolution to show efficiency upside without exploding the benchmark matrix.

---

## 3. Engine Design

### 3.1 Baseline (`baseline.py`) + Profile Synthesis (`profiles.py`)

Lookup chain: ZIP → ASHRAE climate zone + eGRID subregion + state tariff → CBECS site-EUI (building type × zone × vintage) → annual electricity kWh and thermal MMBtu split via end-use fractions per building type.

8760-hour synthesis:
- Temperature-driven end uses (space heating, cooling): degree-hour regressions against bundled TMY dry-bulb temperatures.
- Baseload end uses (lighting, plug loads, etc.): normalized weekday/weekend hourly shape factors per building type.
- Both scaled so annual totals exactly match baseline annual figures.
- Gas profile: heating-degree-hour driven.
- PV available power: PVWatts-style model from TMY GHI/DNI → POA irradiance → AC output per kW.

Baseline outputs: Scope 1 = therms × 53.06 kgCO₂e/MMBtu; Scope 2 = kWh × eGRID CO₂e/MWh; utility spend including demand-charge estimate (peak kW × state $/kW-mo).

### 3.2 Optimizer (`optimizer.py`)

Inner dispatch LP (per candidate sizing):
- Hourly variables: `import_t`, `export_t`, `bess_charge_t`, `bess_discharge_t`, `hp_elec_t`, plus one linearized peak variable `P ≥ import_t`.
- Objective: Σ(import·price) − Σ(export·credit) + P·demand_charge.
- Constraints: load balance (incl. HP electric load), SOC transitions with round-trip efficiency, power/energy limits, PV availability curve.
- Heat pump: COP(t) degrades with outdoor temperature; auxiliary boiler covers hours below switchover temperature.
- Robustness: a high-penalty unmet-load slack variable guarantees feasibility — the solver never hard-fails mid-demo; any unmet hours are surfaced honestly.

Outer sizing loop:
- Coordinate descent over (PV kW, BESS kWh/kW, HP capacity); each LP <1s so dozens of evaluations are cheap.
- Two modes: **maximize NPV**, or **meet decarbonization target (%) at minimum cost**.
- Returns sizes, hourly dispatch, monthly energy balance, savings, emissions trajectory.

### 3.3 Resilience (`resilience.py`)

- Bundled FEMA NRI county-level scores (extreme heat, cold, flood, hurricane, wildfire).
- Exposure score = NRI composite × building-type sensitivity weights → 0–100 scorecard.
- Hazard→mitigation catalog maps to the same assets the optimizer sizes (outage → BESS islanding; extreme heat → heat pump + envelope measures), so selecting measures moves both risk score and financials coherently.

### 3.4 Finance (`finance.py`)

- Installed-cost curves: PV ~$1.7/W, BESS ~$350/kWh, HP $/ton (C&I ranges).
- Incentives modeled: ITC 30% + MACRS depreciation (US credibility requirement).
- Two structures compared side-by-side:
  - **Direct CapEx:** cashflow table yr 0–N, NPV, IRR, simple payback.
  - **EaaS:** zero upfront CapEx; service fee ≈ 85% of year-1 savings with escalator → day-one positive cash flow demonstration.
- Assumptions: 2.5%/yr utility escalation, 0.5%/yr PV degradation, battery augmentation year 11.

---

## 4. API Contracts

All endpoints stateless POSTs (except reference GETs), gzip-enabled, Pydantic-validated.

| Endpoint | Request | Response |
|---|---|---|
| `POST /api/v1/baseline` | zip, building_type, floor_area_sqft | climate zone, eGRID region, annual kWh + MMBtu, Scope 1/2 tCO₂e, spend breakdown, monthly profile + full hourly series |
| `POST /api/v1/optimize` | same inputs + scenario config (objective: `max_npv` \| `target_co2`, asset toggles, target %) | sized assets, monthly balance + hourly dispatch, savings, emissions trajectory, per-asset financials |
| `POST /api/v1/resilience` | zip-derived county, building_type, selected portfolio | hazard scorecard before/after, matched mitigations |
| `GET /api/v1/reference/*` | — | building types, sample/demo ZIPs, tariff assumptions |
| `GET /api/v1/health` | — | liveness |

ZIP validation at runtime uses the bundled ZCTA→county crosswalk; `/reference` exposes a curated shortlist of demo ZIPs for the wizard's quick-pick, while any valid ZIP remains accepted.

---

## 5. Frontend Design (Next.js App Router)

Wizard flow:
1. **Facility** — ZIP lookup, building-type cards, floor area input.
2. **Baseline** — emissions donut, cost breakdown, monthly load chart.
3. **Scenario** — asset toggles, objective selector, decarbonization-target slider.
4. **Results dashboard** — dispatch heatmap, CapEx-vs-EaaS cumulative cashflow comparison, emissions trajectory vs baseline, resilience radar.
5. **Summary** — executive summary page, CSV export (PDF deferred).

State management: zustand, client-side only. Charts: ECharts (heatmap support for dispatch visualization).

---

## 6. Error Handling

- Typed engine exceptions (`UnsupportedZip`, `UnsupportedBuildingType`, `InfeasibleTarget`) mapped by the API layer to RFC 7807 `application/problem+json` responses.
- Frontend validates inputs against `/reference` data before submission.
- LP slack-variable design ensures solver-level robustness (see 3.2).

---

## 7. Testing Strategy

- **Unit tests (engine):** profile synthesis conserves annual totals; property-based LP tests — SOC bounds and energy balance hold under randomized scenarios; finance math verified against hand-computed fixtures.
- **Golden-file regression:** canonical ZIP/building-type combinations pin baseline outputs.
- **Contract tests:** FastAPI TestClient coverage of every endpoint.
- **Frontend:** manual demo script; optional Playwright happy-path test later.

---

## 8. Future Extensions (Phase 4, out of scope)

CRREM stranding-risk curves, embodied carbon (Scope 3) ledger, marginal abatement cost curve waterfall, dynamic TOU tariffs. The engine package layout accommodates these as new submodules without structural change.
