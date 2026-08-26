# Digital Building Optimizer (DBO Prototype)

A standalone technical proof-of-concept inspired by the concepts of the Siemens
Decarbonization Business Optimizer: three facility inputs become an energy and
emissions baseline, clean-energy asset sizing with hourly dispatch, climate
resilience scoring, and CapEx-vs-EaaS financing comparison.

Design spec: `docs/superpowers/specs/2026-08-26-dbo-prototype-design.md`.
Implementation plans: `docs/superpowers/plans/`.

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

## Tests

    cd backend && python -m pytest

## Honesty notes

Load profiles and solar irradiance are deterministic synthetic approximations
("representative meteorological year"); benchmarks are CBECS-derived medians;
tariffs are state averages. Outputs are directionally credible, not investment-grade.
