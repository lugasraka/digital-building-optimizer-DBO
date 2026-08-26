# Digital Building Optimizer (DBO Prototype)

A standalone technical proof-of-concept for building decarbonization planning:
three facility inputs become an energy and emissions baseline, clean-energy
asset sizing with hourly dispatch, climate resilience scoring, and a
CapEx-vs-EaaS financing comparison.

Design spec: `docs/superpowers/specs/2026-08-26-dbo-prototype-design.md`.
Implementation plans: `docs/superpowers/plans/`.

## Features

- **Guided 5-step wizard** (facility → baseline → scenario → results →
  summary) with URL-driven navigation and prerequisite gating
- **Energy & emissions baseline**: monthly load profiles, scope 1/2
  emissions, spend breakdown, peak demand — from ZIP code, building type,
  floor area, and optional vintage
- **Asset optimization**: solar PV, battery storage, and heat pump sizing via
  an hourly linear-program dispatch across all 8,760 hours; `max_npv` or
  CO₂-target objectives
- **Financing comparison**: direct CapEx vs Energy-as-a-Service on customer
  NPV, IRR, and simple payback
- **Climate resilience scoring**: FEMA NRI-derived hazard exposure
  before/after asset mitigation, per hazard and overall
- **PDF technical report**: one-click export with a rationale paragraph per
  recommended asset, financial verdict, emissions trajectory, resilience
  narrative, and a methodology footnote
- **Data & Methods page** (`/methods`): every input traced to a named public
  dataset or inspectable method — no black box
- **CSV export** of baseline monthly, emissions trajectory, and cumulative
  cashflows
- **Offline mock mode**: the wizard runs against committed API fixtures with
  no backend

## Quickstart (backend)

    pip install -r backend/requirements.txt
    uvicorn app.main:create_app --factory --reload --port 8000   # from backend/

All reference datasets are committed under `backend/data/`; no network needed.
To rebuild them from public sources (optional):

    python data_pipeline/build_crosswalk.py   # needs network (US Census)
    python data_pipeline/build_tmy.py         # offline, deterministic
    python data_pipeline/build_nri.py         # FEMA NRI w/ offline fallback

## API tour

    curl -s localhost:8000/api/v1/health
    curl -s -X POST localhost:8000/api/v1/baseline -H 'Content-Type: application/json' \
      -d '{"zip_code":"94105","building_type":"office","floor_area_sqft":50000}'
    curl -s -X POST localhost:8000/api/v1/optimize -H 'Content-Type: application/json' \
      -d '{"facility":{"zip_code":"94105","building_type":"office","floor_area_sqft":50000},
           "scenario":{"objective":"target_co2","co2_reduction_target_pct":40}}'
    curl -s -X POST localhost:8000/api/v1/resilience -H 'Content-Type: application/json' \
      -d '{"zip_code":"94105","building_type":"hospital"}'

End-to-end check against a running server: `./scripts/smoke_demo.sh`.

## Quickstart (frontend wizard)

    cd frontend
    npm install
    cp .env.local.example .env.local   # NEXT_PUBLIC_API_BASE, NEXT_PUBLIC_USE_MOCKS
    npm run dev                        # http://localhost:3000

With `NEXT_PUBLIC_USE_MOCKS=1` the wizard runs fully offline against committed
fixtures in `frontend/public/fixtures/` (captured from the live API). With mocks
off, start the backend first (above) and point `NEXT_PUBLIC_API_BASE` at it.

## Tests (frontend)

    cd frontend
    npm test          # Vitest unit tests (API, store, validation, PDF narrative, methodology)
    npm run e2e       # Playwright: wizard happy path + PDF export (mock mode;
                      # needs npx playwright install chromium once)

To run the e2e suite against a live backend instead of fixtures:

    PLAYWRIGHT_USE_MOCKS=0 npm run e2e

## Data sources & methodology

Every number in the app traces back to a named source — see the in-app
**Data & Methods** page (`/methods`) for the full registry with per-source
descriptions:

| Input | Source |
|---|---|
| ZIP → county lookup | U.S. Census 2020 ZCTA-to-county relationship file |
| Climate zone groups | ASHRAE-style classification per weather station |
| Weather & solar profiles | Deterministic synthetic representative meteorological year (`data_pipeline/build_tmy.py`) |
| EUI benchmarks | CBECS 2018 survey medians (EIA) |
| Tariffs & grid carbon | EIA state averages · EPA eGRID2022 subregions |
| Hazard scores | FEMA National Risk Index, county level |
| Dispatch | Hourly linear program (open, inspectable) |
| Financing | Standard NPV / IRR / simple-payback cashflow model |

The pipeline scripts under `data_pipeline/` regenerate each dataset from its
public source.

## Honesty notes

Load profiles and solar irradiance are deterministic synthetic approximations
("representative meteorological year"); benchmarks are CBECS-derived medians;
tariffs are state averages. Outputs are directionally credible, not
investment-grade.
