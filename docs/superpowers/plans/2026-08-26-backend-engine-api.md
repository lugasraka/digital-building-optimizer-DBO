# DBO Prototype — Backend Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete DBO prototype backend: bundled US reference datasets, framework-free analysis engine (baseline → optimization → finance → resilience), FastAPI layer exposing it as a stateless JSON API.

**Architecture:** Modular monolith per `docs/superpowers/specs/2026-08-26-dbo-prototype-design.md`. `backend/engine/` is pure Python (numpy/pandas/scipy/pydantic only); `backend/app/` is a thin FastAPI shell; `data_pipeline/` holds run-once scripts that compile datasets into `backend/data/` (outputs are committed; scripts exist for reproducibility).

**Tech Stack:** Python 3.11+, FastAPI, Pydantic v2, numpy, pandas, scipy (`linprog`, HiGHS), pyarrow, pytest, httpx.

**Deviation from spec file list:** the spec sketched `fetch_cbecs.py` / `fetch_egrid.py`; CBECS medians and eGRID factors are instead committed directly as curated JSON (they are static survey tables). Pipeline scripts exist where generation or downloading genuinely matters (`build_crosswalk`, `build_tmy`, `build_nri`).

## Global Constraints

- Engine modules import **only** stdlib + numpy/pandas/scipy/pydantic. Never import FastAPI inside `engine/`.
- Every POST endpoint is stateless; full inputs every request.
- ZIP resolution order: committed crosswalk → raise `UnsupportedZip`.
- Building types (exact enum values): `office`, `retail_standalone`, `warehouse`, `k12_school`, `hospital`, `hotel`.
- Vintages (exact): `pre1980`, `1980_2004`, `post2004`. Default when unspecified: `1980_2004`.
- Climate zone groups (exact): `very_cold_cold`, `mixed_humid`, `mixed_dry_marine`, `hot_humid`, `hot_dry`.
- Scope 1 gas factor: 53.06 kgCO₂e/MMBtu. Grid factor: eGRID kgCO₂e/MWh per state.
- Unit constants: 1 therm = 0.1 MMBtu (therms = MMBtu × 10); 1 MMBtu/h thermal ↔ 0.293071 MW electric at COP 1; roof PV packing 0.010 kW/sqft floor area.
- Finance constants (verbatim): PV $1,700/kW installed; BESS $400/kWh installed; HP $1,800/ton; ITC 30% on PV+BESS; corporate tax 21%; MACRS-5 schedule `[0.20, 0.32, 0.192, 0.1152, 0.1152, 0.0576]`; discount 8%; utility escalation 2.5%/yr; PV degradation 0.5%/yr; battery augmentation year 11 at 40% of BESS CapEx; EaaS fee 85% of year-1 savings escalating 2%/yr; horizon 15 years.
- Savings annuity: applied to year-1 LP savings as `Σ_{y=1..15} ((1.025)/(1.08))^y × (1 - 0.005 × pv_savings_share)^y`. Documented simplification; no re-dispatch per year.
- LP robustness: unmet-load slack priced at $10,000/kWh; solver can never hard-fail; unmet surfaced in results.
- Demand charge: single annual peak × 12 × state $/kW-month.
- Export credit: 50% of retail electric rate.
- Battery efficiency 0.95 each direction. Battery starts and ends empty (cyclic constraint).
- Synthetic TMY deterministic (seed 42), labeled "representative meteorological year".
- Commands run from repo root unless stated. Install deps once: `pip install -r backend/requirements.txt`.

---

### Task 1: Backend scaffold with health endpoint

**Files:**
- Create: `backend/requirements.txt`, `backend/pytest.ini`
- Create: `backend/app/__init__.py`, `backend/app/main.py`, `backend/app/api/__init__.py`, `backend/app/api/v1/__init__.py`
- Create: `backend/engine/__init__.py`
- Create: `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_health.py`

**Interfaces:**
- Produces: `create_app() -> FastAPI` in `backend/app/main.py`. Later tasks register routers with `app.include_router(router, prefix="/api/v1")`.
- Produces: test convention `TestClient(create_app())`; `conftest.py` puts `backend/` on `sys.path`.

- [ ] **Step 1: Write requirements and pytest config**

Create `backend/requirements.txt`:

```text
fastapi>=0.111
uvicorn[standard]>=0.30
pydantic>=2.7
numpy>=1.26
pandas>=2.2
scipy>=1.13
pyarrow>=16.0
pytest>=8.2
httpx>=0.27
```

Create `backend/pytest.ini`:

```ini
[pytest]
testpaths = tests
addopts = -q
```

- [ ] **Step 2: Write failing test**

Create `backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_health_returns_ok():
    client = TestClient(create_app())
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app'`

- [ ] **Step 4: Write minimal implementation**

Create empty files: `backend/app/__init__.py`, `backend/app/api/__init__.py`, `backend/app/api/v1/__init__.py`, `backend/engine/__init__.py`, `backend/tests/__init__.py`.

Create `backend/app/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware


def create_app() -> FastAPI:
    app = FastAPI(title="DBO Prototype API", version="0.1.0")
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/v1/health")
    def health() -> dict:
        return {"status": "ok"}

    return app
```

Create `backend/tests/conftest.py`:

```python
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
```

Install dependencies: `pip install -r backend/requirements.txt`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: PASS (1 passed)

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(backend): scaffold FastAPI app with health endpoint"
```

---

### Task 2: Reference data loader + seed datasets

**Files:**
- Create: `backend/data/eui_benchmarks.json`
- Create: `backend/data/grid_factors.json`
- Create: `backend/data/climate_zones.json` (demo fallback; replaced by full crosswalk in Task 4)
- Create: `backend/engine/errors.py`, `backend/engine/data.py`
- Test: `backend/tests/test_data_repo.py`

**Interfaces:**
- Consumes: nothing.
- Produces (used by ALL later tasks):

```python
# backend/engine/errors.py
class UnsupportedZip(ValueError): ...
class UnsupportedBuildingType(ValueError): ...

# backend/engine/data.py
@dataclass(frozen=True)
class Location: county_fips: str; county_name: str; state: str
                zone_group: str; station_id: str
@dataclass(frozen=True)
class Tariff: co2e_kg_per_mwh: float; elec_usd_kwh: float
              demand_usd_kw_month: float; gas_usd_therm: float
@dataclass(frozen=True)
class Benchmark: elec_kwh_sqft: float; gas_kwh_sqft: float
                 end_use_fractions: dict  # {"cooling": f, "heating": f, "flat": f}
                 gas_flat_fraction: float
                 balance_temps_c: dict    # {"heat": t, "cool": t}
                 weekend_scale: float

class DataRepo:
    def __init__(self, data_dir: Path | None = None): ...  # default backend/data
    def location(self, zip5: str) -> Location          # raises UnsupportedZip
    def tariff(self, state: str) -> Tariff             # falls back to DEFAULT row
    def benchmark(self, building_type: str, zone_group: str,
                  vintage: str) -> Benchmark           # raises UnsupportedBuildingType
    def building_types(self) -> list[str]
```

EUI resolution formula: `value = base[type] × zone_multipliers[zone] × vintage_multipliers[vintage]`.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_data_repo.py`:

```python
import pytest

from engine.data import DataRepo
from engine.errors import UnsupportedBuildingType, UnsupportedZip


@pytest.fixture()
def repo() -> DataRepo:
    return DataRepo()


def test_location_demo_zip(repo):
    loc = repo.location("94105")
    assert loc.state == "CA"
    assert loc.zone_group == "mixed_dry_marine"
    assert loc.county_fips == "06075"


def test_unknown_zip_raises(repo):
    with pytest.raises(UnsupportedZip):
        repo.location("00000")


def test_tariff_known_state(repo):
    t = repo.tariff("CA")
    assert t.elec_usd_kwh == pytest.approx(0.24)


def test_tariff_unknown_state_falls_back_to_default(repo):
    assert repo.tariff("VT").co2e_kg_per_mwh == repo.tariff("US").co2e_kg_per_mwh


def test_benchmark_resolution_formula(repo):
    b = repo.benchmark("office", "mixed_humid", "1980_2004")
    assert b.elec_kwh_sqft == pytest.approx(14.0)
    cold_old = repo.benchmark("office", "very_cold_cold", "pre1980")
    assert cold_old.elec_kwh_sqft == pytest.approx(14.0 * 1.22 * 1.20)


def test_benchmark_end_use_fractions_sum_to_one(repo):
    for bt in repo.building_types():
        fracs = repo.benchmark(bt, "mixed_humid", "post2004").end_use_fractions
        assert sum(fracs.values()) == pytest.approx(1.0)


def test_unsupported_building_type(repo):
    with pytest.raises(UnsupportedBuildingType):
        repo.benchmark("igloo", "mixed_humid", "pre1980")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_data_repo.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'engine.errors'` (module missing)

- [ ] **Step 3: Write seed datasets**

Create `backend/engine/errors.py`:

```python
class UnsupportedZip(ValueError):
    """ZIP code not present in the bundled crosswalk."""


class UnsupportedBuildingType(ValueError):
    """Building type not present in the bundled benchmarks."""
```

Create `backend/data/eui_benchmarks.json`:

```json
{
  "meta": {
    "source": "CBECS 2018 survey medians, climate/vintage adjusted approximations",
    "units": "kWh per sqft per year, site energy"
  },
  "base": {
    "office":            { "electricity": 14.0, "gas": 9.0 },
    "retail_standalone": { "electricity": 8.0,  "gas": 3.0 },
    "warehouse":         { "electricity": 3.5,  "gas": 2.0 },
    "k12_school":        { "electricity": 4.5,  "gas": 6.0 },
    "hospital":          { "electricity": 12.0, "gas": 11.0 },
    "hotel":             { "electricity": 9.5,  "gas": 7.0 }
  },
  "zone_multipliers": {
    "very_cold_cold": 1.22,
    "mixed_humid": 1.00,
    "mixed_dry_marine": 1.05,
    "hot_humid": 1.02,
    "hot_dry": 1.08
  },
  "vintage_multipliers": {
    "pre1980": 1.20,
    "1980_2004": 1.00,
    "post2004": 0.75
  },
  "profiles": {
    "office": {
      "end_use_fractions": { "cooling": 0.28, "heating": 0.12, "flat": 0.60 },
      "gas_flat_fraction": 0.15,
      "balance_temps_c":   { "heat": 15.0, "cool": 24.0 },
      "weekend_scale": 0.35
    },
    "retail_standalone": {
      "end_use_fractions": { "cooling": 0.35, "heating": 0.05, "flat": 0.60 },
      "gas_flat_fraction": 0.30,
      "balance_temps_c":   { "heat": 16.0, "cool": 24.0 },
      "weekend_scale": 0.80
    },
    "warehouse": {
      "end_use_fractions": { "cooling": 0.12, "heating": 0.08, "flat": 0.80 },
      "gas_flat_fraction": 0.20,
      "balance_temps_c":   { "heat": 12.0, "cool": 26.0 },
      "weekend_scale": 0.95
    },
    "k12_school": {
      "end_use_fractions": { "cooling": 0.22, "heating": 0.18, "flat": 0.60 },
      "gas_flat_fraction": 0.15,
      "balance_temps_c":   { "heat": 17.0, "cool": 24.0 },
      "weekend_scale": 0.15
    },
    "hospital": {
      "end_use_fractions": { "cooling": 0.28, "heating": 0.17, "flat": 0.55 },
      "gas_flat_fraction": 0.35,
      "balance_temps_c":   { "heat": 16.0, "cool": 23.0 },
      "weekend_scale": 0.92
    },
    "hotel": {
      "end_use_fractions": { "cooling": 0.27, "heating": 0.21, "flat": 0.52 },
      "gas_flat_fraction": 0.40,
      "balance_temps_c":   { "heat": 15.0, "cool": 24.0 },
      "weekend_scale": 0.88
    }
  }
}
```

Create `backend/data/grid_factors.json`:

```json
{
  "meta": {
    "source": "eGRID2022 subregion averages and EIA state average tariffs (approximations)",
    "units": "kgCO2e/MWh; USD/kWh; USD/kW-month; USD/therm"
  },
  "DEFAULT": {
    "state": "US", "egrid_subregion": "USAV",
    "co2e_kg_per_mwh": 363.0,
    "elec_usd_kwh": 0.131, "demand_usd_kw_month": 12.0, "gas_usd_therm": 1.20
  },
  "rows": [
    { "state": "CA", "egrid_subregion": "CAMX", "co2e_kg_per_mwh": 240.0, "elec_usd_kwh": 0.24,  "demand_usd_kw_month": 15.0, "gas_usd_therm": 1.90 },
    { "state": "TX", "egrid_subregion": "ERCT", "co2e_kg_per_mwh": 380.0, "elec_usd_kwh": 0.125, "demand_usd_kw_month": 10.0, "gas_usd_therm": 0.85 },
    { "state": "NY", "egrid_subregion": "NYCW", "co2e_kg_per_mwh": 195.0, "elec_usd_kwh": 0.21,  "demand_usd_kw_month": 16.0, "gas_usd_therm": 1.40 },
    { "state": "IL", "egrid_subregion": "RFCW", "co2e_kg_per_mwh": 330.0, "elec_usd_kwh": 0.13,  "demand_usd_kw_month": 12.0, "gas_usd_therm": 0.95 },
    { "state": "CO", "egrid_subregion": "RMPA", "co2e_kg_per_mwh": 480.0, "elec_usd_kwh": 0.12,  "demand_usd_kw_month": 11.0, "gas_usd_therm": 0.90 },
    { "state": "WA", "egrid_subregion": "NWPG", "co2e_kg_per_mwh": 90.0,  "elec_usd_kwh": 0.105, "demand_usd_kw_month": 9.0,  "gas_usd_therm": 1.00 },
    { "state": "AZ", "egrid_subregion": "DSWE", "co2e_kg_per_mwh": 420.0, "elec_usd_kwh": 0.12,  "demand_usd_kw_month": 12.0, "gas_usd_therm": 0.90 },
    { "state": "GA", "egrid_subregion": "SOCO", "co2e_kg_per_mwh": 390.0, "elec_usd_kwh": 0.115, "demand_usd_kw_month": 11.0, "gas_usd_therm": 0.95 },
    { "state": "MA", "egrid_subregion": "ISNE", "co2e_kg_per_mwh": 240.0, "elec_usd_kwh": 0.24,  "demand_usd_kw_month": 15.0, "gas_usd_therm": 1.60 },
    { "state": "FL", "egrid_subregion": "FRCC", "co2e_kg_per_mwh": 400.0, "elec_usd_kwh": 0.12,  "demand_usd_kw_month": 10.0, "gas_usd_therm": 0.95 },
    { "state": "OH", "egrid_subregion": "RFCW", "co2e_kg_per_mwh": 350.0, "elec_usd_kwh": 0.11,  "demand_usd_kw_month": 9.0,  "gas_usd_therm": 0.85 },
    { "state": "PA", "egrid_subregion": "RFCW", "co2e_kg_per_mwh": 350.0, "elec_usd_kwh": 0.12,  "demand_usd_kw_month": 10.0, "gas_usd_therm": 0.95 }
  ]
}
```

Create `backend/data/climate_zones.json`:

```json
{
  "meta": {
    "note": "Demo fallback subset. Full ZIP3->county crosswalk is generated once by data_pipeline/build_crosswalk.py and overwrites this file."
  },
  "demo_zips": {
    "94105": { "county_fips": "06075", "county_name": "San Francisco County", "state": "CA", "zone_group": "mixed_dry_marine", "station_id": "KSFO" },
    "10001": { "county_fips": "36061", "county_name": "New York County",      "state": "NY", "zone_group": "mixed_humid",     "station_id": "KNYC" },
    "60601": { "county_fips": "17031", "county_name": "Cook County",          "state": "IL", "zone_group": "very_cold_cold",  "station_id": "KCHI" },
    "77002": { "county_fips": "48201", "county_name": "Harris County",        "state": "TX", "zone_group": "hot_humid",       "station_id": "KHOU" },
    "85004": { "county_fips": "04013", "county_name": "Maricopa County",      "state": "AZ", "zone_group": "hot_dry",         "station_id": "KPHX" },
    "30303": { "county_fips": "13121", "county_name": "Fulton County",        "state": "GA", "zone_group": "mixed_humid",     "station_id": "KATL" },
    "80202": { "county_fips": "08031", "county_name": "Denver County",        "state": "CO", "zone_group": "very_cold_cold",  "station_id": "KDEN" },
    "98104": { "county_fips": "53033", "county_name": "King County",          "state": "WA", "zone_group": "mixed_dry_marine","station_id": "KSEA" }
  }
}
```

- [ ] **Step 4: Write the loader**

Create `backend/engine/data.py`:

```python
import json
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

from engine.errors import UnsupportedBuildingType, UnsupportedZip

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


@dataclass(frozen=True)
class Location:
    county_fips: str
    county_name: str
    state: str
    zone_group: str
    station_id: str


@dataclass(frozen=True)
class Tariff:
    co2e_kg_per_mwh: float
    elec_usd_kwh: float
    demand_usd_kw_month: float
    gas_usd_therm: float


@dataclass(frozen=True)
class Benchmark:
    elec_kwh_sqft: float
    gas_kwh_sqft: float
    end_use_fractions: dict
    gas_flat_fraction: float
    balance_temps_c: dict
    weekend_scale: float


class DataRepo:
    """Loads bundled reference datasets. Read-only, process-wide singleton via get_repo()."""

    def __init__(self, data_dir: Path | None = None) -> None:
        self._dir = Path(data_dir) if data_dir else DATA_DIR

    def _load(self, name: str) -> dict:
        return json.loads((self._dir / name).read_text())

    @cached_property
    def _zones(self) -> dict:
        return self._load("climate_zones.json")

    @cached_property
    def _grid(self) -> dict:
        return self._load("grid_factors.json")

    @cached_property
    def _eui(self) -> dict:
        return self._load("eui_benchmarks.json")

    def building_types(self) -> list[str]:
        return list(self._eui["base"].keys())

    def location(self, zip5: str) -> Location:
        entry = self._zones["demo_zips"].get(zip5) or self._zones.get("crosswalk", {}).get(zip5[:3])
        if entry is None:
            raise UnsupportedZip(f"ZIP {zip5!r} not in bundled crosswalk")
        return Location(
            county_fips=entry["county_fips"],
            county_name=entry["county_name"],
            state=entry["state"],
            zone_group=entry["zone_group"],
            station_id=entry["station_id"],
        )

    def tariff(self, state: str) -> Tariff:
        for row in self._grid["rows"]:
            if row["state"] == state:
                return Tariff(**{k: row[k] for k in Tariff.__dataclass_fields__})
        d = self._grid["DEFAULT"]
        return Tariff(d["co2e_kg_per_mwh"], d["elec_usd_kwh"], d["demand_usd_kw_month"], d["gas_usd_therm"])

    def benchmark(self, building_type: str, zone_group: str, vintage: str) -> Benchmark:
        base = self._eui["base"].get(building_type)
        if base is None or building_type not in self._eui["profiles"]:
            raise UnsupportedBuildingType(f"unknown building type {building_type!r}")
        zm = self._eui["zone_multipliers"][zone_group]
        vm = self._eui["vintage_multipliers"][vintage]
        prof = self._eui["profiles"][building_type]
        return Benchmark(
            elec_kwh_sqft=base["electricity"] * zm * vm,
            gas_kwh_sqft=base["gas"] * zm * vm,
            end_use_fractions=prof["end_use_fractions"],
            gas_flat_fraction=prof["gas_flat_fraction"],
            balance_temps_c=prof["balance_temps_c"],
            weekend_scale=prof["weekend_scale"],
        )


_repo: DataRepo | None = None


def get_repo() -> DataRepo:
    global _repo
    if _repo is None:
        _repo = DataRepo()
    return _repo
```

Note the loader reads `demo_zips` first, then a `crosswalk` key that Task 4's pipeline adds — no code change needed when the full file lands.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_data_repo.py -v`
Expected: PASS (7 passed)

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(engine): reference data loader with CBECS/eGRID seed datasets"
```

---

### Task 3: Pydantic API/engine contract models

**Files:**
- Create: `backend/engine/models.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Consumes: nothing yet.
- Produces (exact names/types used by all later tasks):

```python
class BuildingType(str, Enum):
    OFFICE = "office"; RETAIL = "retail_standalone"; WAREHOUSE = "warehouse"
    SCHOOL = "k12_school"; HOSPITAL = "hospital"; HOTEL = "hotel"

class Vintage(str, Enum):
    PRE1980 = "pre1980"; MID = "1980_2004"; POST2004 = "post2004"

class ObjectiveMode(str, Enum): MAX_NPV = "max_npv"; TARGET_CO2 = "target_co2"

class FacilityInput(BaseModel):
    zip_code: str = Field(pattern=r"^\d{5}$")
    building_type: BuildingType
    floor_area_sqft: float = Field(gt=500, le=5_000_000)
    vintage: Vintage | None = None   # None -> engine uses "1980_2004"

class MonthlyPoint(BaseModel): month: int; electricity_kwh: float; gas_mmbtu: float
class SpendBreakdown(BaseModel):
    electricity_usd: float; demand_charges_usd: float; gas_usd: float; total_usd: float

class BaselineRequest(FacilityInput): ...
class BaselineResponse(BaseModel):
    zip_code: str; county_fips: str; county_name: str; state: str
    climate_zone_group: str; tmy_station_id: str
    annual_electricity_kwh: float; annual_gas_mmbtu: float
    scope1_tco2e: float; scope2_tco2e: float; total_tco2e: float
    peak_kw: float; spend: SpendBreakdown
    monthly: list[MonthlyPoint]
    hourly_electric_kw: list[float]         # length 8760
    hourly_gas_mmbtu_per_hour: list[float]  # length 8760
    data_provenance: str

class AssetToggles(BaseModel): pv: bool = True; bess: bool = True; heat_pump: bool = True
class ScenarioConfig(BaseModel):
    objective: ObjectiveMode = ObjectiveMode.MAX_NPV
    co2_reduction_target_pct: float | None = Field(default=None, ge=1, le=100)
    assets: AssetToggles = AssetToggles()

class OptimizeRequest(BaseModel): facility: FacilityInput; scenario: ScenarioConfig
class AssetSizing(BaseModel):
    pv_kw: float; bess_kwh: float; bess_kw: float; hp_fraction: float; hp_capacity_tons: float
class DispatchSummary(BaseModel):
    annual_import_kwh: float; annual_export_kwh: float; annual_gas_mmbtu_after: float
    unmet_hours: int; peak_kw_after: float
class YearlyEmissions(BaseModel): year: int; scope1_tco2e: float; scope2_tco2e: float
class FinancialSummary(BaseModel):
    capex_gross_usd: float; incentives_usd: float; capex_net_usd: float
    annual_savings_yr1_usd: float; npv_usd: float; irr: float | None
    simple_payback_years: float | None
    eaas_annual_fee_yr1_usd: float; eaas_npv_customer_benefit_usd: float
    capex_cashflow: list[float]; eaas_net_cashflow: list[float]   # index 0 = year 0

class OptimizeResponse(BaseModel):
    county_name: str; state: str; climate_zone_group: str
    objective_mode: ObjectiveMode
    baseline_total_cost_usd: float
    baseline_scope1_tco2e: float; baseline_scope2_tco2e: float; baseline_total_tco2e: float
    sizing: AssetSizing | None             # None => do-nothing optimal
    dispatch: DispatchSummary              # always present
    financials: FinancialSummary | None    # None when sizing is None
    emissions_trajectory: list[YearlyEmissions]
    target_met: bool | None                # TARGET_CO2 mode only
    evaluation_log: list[dict]             # one row per sizing combo evaluated

class ResilienceRequest(BaseModel):
    zip_code: str = Field(pattern=r"^\d{5}$")
    building_type: BuildingType
    portfolio: AssetToggles = AssetToggles()
class HazardScore(BaseModel): hazard: str; before: float; after: float; mitigations: list[str]
class ResilienceResponse(BaseModel):
    county_fips: str; county_name: str; state: str
    overall_before: float; overall_after: float; hazards: list[HazardScore]
```

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_models.py`:

```python
import pytest
from pydantic import ValidationError

from engine.models import BuildingType, FacilityInput


def test_facility_input_accepts_valid():
    f = FacilityInput(zip_code="94105", building_type=BuildingType.OFFICE, floor_area_sqft=50_000)
    assert f.vintage is None


def test_zip_pattern_enforced():
    with pytest.raises(ValidationError):
        FacilityInput(zip_code="9410", building_type=BuildingType.OFFICE, floor_area_sqft=50_000)


def test_floor_area_bounds():
    with pytest.raises(ValidationError):
        FacilityInput(zip_code="94105", building_type=BuildingType.OFFICE, floor_area_sqft=100)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_models.py -v`
Expected: FAIL — `No module named 'engine.models'`

- [ ] **Step 3: Implement models**

Create `backend/engine/models.py` containing exactly the classes listed under Interfaces. Imports allowed: `enum`, `pydantic`. Field names/types/defaults are contractual — later tasks compile against them.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_models.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(engine): shared pydantic request/response models"
```

---

### Task 4: Full ZIP3→county crosswalk pipeline

**Files:**
- Create: `data_pipeline/build_crosswalk.py`
- Modify (via pipeline run): `backend/data/climate_zones.json` — gains a `crosswalk` dict keyed by 3-digit ZIP prefix
- Test: `backend/tests/test_crosswalk.py`

**Interfaces:**
- Produces in `climate_zones.json`: `"crosswalk": {"941": {...entry}, ...}` where entry has keys `county_fips`, `county_name`, `state`, `zone_group`, `station_id`. `DataRepo.location()` (Task 2) already reads this key via ZIP3 prefix.
- Station assignment: per-state mapping via an embedded `STATE_STATION` table (deterministic, prototype fidelity). Station IDs reference the synthetic stations built in Task 5.

State→zone rules — ordered, first match wins; unlisted states → `mixed_humid`. TX is grouped hot_humid (deliberate simplification).

```python
ZONE_RULES = [
    ("hot_humid",        {"FL","LA","MS","AL","GA","SC","AR","TN","NC","VA","KY","TX"}),
    ("hot_dry",          {"AZ","NV","NM","OK","KS"}),
    ("mixed_dry_marine", {"CA","WA","OR"}),
    ("very_cold_cold",   {"MN","ND","SD","MT","WI","ME","ID","WY","NH","VT","IA","NE",
                          "IL","IN","OH","PA","NY","NJ","CT","RI","MA","CO","UT","AK"}),
]
```

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_crosswalk.py`:

```python
import pytest

from engine.data import DataRepo
from engine.errors import UnsupportedZip


def test_crosswalk_resolves_non_demo_zip():
    loc = DataRepo().location("55401")  # Minneapolis, ZIP3 554
    assert loc.state == "MN"
    assert loc.zone_group == "very_cold_cold"


def test_demo_zips_still_resolve_after_rebuild():
    loc = DataRepo().location("94105")
    assert loc.state == "CA"


def test_invalid_zip_still_raises():
    with pytest.raises(UnsupportedZip):
        DataRepo().location("00000")
```

Run: `cd backend && python -m pytest tests/test_crosswalk.py -v`
Expected: FAIL — `test_crosswalk_resolves_non_demo_zip` raises `UnsupportedZip` (no crosswalk yet). The other two PASS already; that is fine.

- [ ] **Step 2: Write the pipeline script**

Create `data_pipeline/build_crosswalk.py`:

```python
"""Builds full ZIP3 -> county crosswalk into backend/data/climate_zones.json.

Downloads the US Census 2020 ZCTA-to-county relationship file once (network
required). Deterministic output. Run from repo root:
    python data_pipeline/build_crosswalk.py
"""
import csv
import io
import json
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "backend" / "data"
ZONES_FILE = DATA / "climate_zones.json"

# Census 2020 ZCTA20 <-> county20 national relationship file (pipe-delimited)
SOURCE_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/"
    "tab20_zcta520_county20_natl.txt.zip"
)

ZONE_RULES = [
    ("hot_humid",        {"FL","LA","MS","AL","GA","SC","AR","TN","NC","VA","KY","TX"}),
    ("hot_dry",          {"AZ","NV","NM","OK","KS"}),
    ("mixed_dry_marine", {"CA","WA","OR"}),
    ("very_cold_cold",   {"MN","ND","SD","MT","WI","ME","ID","WY","NH","VT","IA","NE",
                          "IL","IN","OH","PA","NY","NJ","CT","RI","MA","CO","UT","AK"}),
]

STATE_STATION = {  # station per state; demo fallback entries agree with this table
    "CA":"KSFO","NY":"KNYC","IL":"KCHI","TX":"KHOU","AZ":"KPHX","GA":"KATL",
    "CO":"KDEN","WA":"KSEA","MA":"KBOS","FL":"KMIA","PA":"KPHL","MN":"KMSP",
    "UT":"KSLC","NV":"KLAS","OR":"KPDX","MI":"KDTW","NJ":"KPHL","OH":"KCLE",
    "IN":"KIND","WI":"KMKE","MO":"KMEM","TN":"KBNA","NC":"KCLT","MD":"KPHL",
    "VA":"KCLT","KY":"KBNA","OK":"KOKC","KS":"KOKC","NM":"KPHX","SC":"KATL",
    "LA":"KHOU","AL":"KATL","MS":"KMEM","AR":"KMEM","IA":"KMSP","NE":"KMSP",
    "ND":"KMSP","SD":"KMSP","MT":"KMSP","ME":"KBOS","NH":"KBOS","VT":"KBOS",
    "CT":"KBOS","RI":"KBOS","ID":"KSLC","WY":"KDEN","DC":"KPHL","DE":"KPHL",
}
DEFAULT_STATION = "KCHI"

FIPS2USPS = {
    "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE",
    "11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA",
    "20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN",
    "28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM",
    "36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
    "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA",
    "54":"WV","55":"WI","56":"WY",
}


def zone_for_state(state: str) -> str:
    for zone, states in ZONE_RULES:
        if state in states:
            return zone
    return "mixed_humid"


def build() -> None:
    print(f"downloading {SOURCE_URL}")
    raw = urllib.request.urlopen(SOURCE_URL, timeout=120).read()
    zf = zipfile.ZipFile(io.BytesIO(raw))
    text = io.TextIOWrapper(zf.open(zf.namelist()[0]), encoding="latin-1")

    # Plurality vote: each Census ZCTA row contributes one vote to its ZIP3's county.
    votes: dict[str, defaultdict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in csv.DictReader(text, delimiter="|"):
        zip3 = row["ZCTA5_20"].zfill(5)[:3]
        fips = row["COUNTY_20"].zfill(5)
        name_col = next(c for c in row if c.endswith("NAME"))
        votes[zip3][f"{fips}|{row[name_col]}"] += 1

    crosswalk: dict[str, dict] = {}
    for zip3, tally in sorted(votes.items()):
        best, _votes = max(tally.items(), key=lambda kv: kv[1])
        fips, cname = best.split("|", 1)
        usps = FIPS2USPS[fips[:2]]
        crosswalk[zip3] = {
            "county_fips": fips,
            "county_name": cname,
            "state": usps,
            "zone_group": zone_for_state(usps),
            "station_id": STATE_STATION.get(usps, DEFAULT_STATION),
        }

    doc = json.loads(ZONES_FILE.read_text())
    doc["crosswalk"] = crosswalk
    ZONES_FILE.write_text(json.dumps(doc, indent=1))
    print(f"wrote {len(crosswalk)} ZIP3 entries to {ZONES_FILE}")


if __name__ == "__main__":
    build()
```

- [ ] **Step 3: Run the pipeline**

Run: `python data_pipeline/build_crosswalk.py`
Expected: prints `wrote ~900+ ZIP3 entries...`. If the Census URL fails, STOP and ask the user before substituting another source URL — do not silently change provenance.

- [ ] **Step 4: Verify tests pass**

Run: `cd backend && python -m pytest tests/test_crosswalk.py tests/test_data_repo.py -v`
Expected: all PASS (crosswalk now resolves non-demo ZIPs)

- [ ] **Step 5: Commit generated dataset + script**

```bash
git add data_pipeline/build_crosswalk.py backend/data/climate_zones.json
git commit -m "feat(data): full ZIP3->county crosswalk from Census ZCTA file"
```

---

### Task 5: Synthetic TMY profiles pipeline + `DataRepo.tmy()`

**Files:**
- Create: `data_pipeline/build_tmy.py`
- Create (generated, committed): `backend/data/tmy_profiles.parquet`, `backend/data/stations.json`
- Modify: `backend/engine/data.py` (add `tmy()`)
- Test: `backend/tests/test_tmy.py`

**Interfaces:**
- Produces `backend/data/stations.json`: `[{"id":"KSFO","name":"San Francisco","state":"CA","zone_group":"mixed_dry_marine","lat":37.6}, ...]` (lat from `STATION_LAT`, needed later by the PV model).
- Produces `tmy_profiles.parquet`: columns `station_id(str)`, `hour(int 0..8759)`, `temp_c(float)`, `ghi_wm2(float)`; one row per station-hour (~29 × 8760).
- Produces on `DataRepo`:

```python
    @cached_property
    def _tmy_frame(self) -> pd.DataFrame: ...   # full parquet, loaded once

    def tmy(self, station_id: str) -> pd.DataFrame:
        """DataFrame indexed by hour 0..8759 with columns temp_c, ghi_wm2."""

    def station_lat(self, station_id: str) -> float: ...
```

Model (documented simplifications, all deterministic seed 42):
- Temperature: seasonal anchor interpolation between January and July monthly means + sinusoidal diurnal swing peaking 15:00.
- Irradiance: clear-sky GHI from solar geometry (declination + hour angle), scaled by per-station cloud factor, clipped at 0.

Station anchors (`tjan`, `tjul` °C, diurnal amplitude `amp`, cloud factor `cf`) — embed exactly:

```python
STATIONS = [
    ("KSFO","San Francisco","CA","mixed_dry_marine",10.0,17.0,6.0,0.55),
    ("KNYC","New York","NY","mixed_humid",0.5,25.0,7.0,0.60),
    ("KCHI","Chicago","IL","very_cold_cold",-5.0,24.0,7.5,0.55),
    ("KHOU","Houston","TX","hot_humid",13.0,29.5,8.0,0.55),
    ("KPHX","Phoenix","AZ","hot_dry",14.0,35.5,11.0,0.85),
    ("KATL","Atlanta","GA","mixed_humid",7.5,27.0,8.5,0.55),
    ("KDEN","Denver","CO","very_cold_cold",-1.5,24.5,11.0,0.70),
    ("KSEA","Seattle","WA","mixed_dry_marine",5.0,19.5,7.0,0.45),
    ("KBOS","Boston","MA","very_cold_cold",-1.0,23.5,7.0,0.58),
    ("KMIA","Miami","FL","hot_humid",20.5,28.5,6.0,0.62),
    ("KLAX","Los Angeles","CA","mixed_dry_marine",14.0,23.5,5.5,0.70),
    ("KDTW","Detroit","MI","very_cold_cold",-3.5,23.0,7.5,0.52),
    ("KPHL","Philadelphia","PA","mixed_humid",1.0,25.5,7.5,0.58),
    ("KMSP","Minneapolis","MN","very_cold_cold",-10.0,23.0,8.5,0.58),
    ("KSLC","Salt Lake City","UT","very_cold_cold",-1.0,27.0,10.0,0.65),
    ("KDFW","Dallas","TX","hot_humid",9.5,30.5,9.5,0.60),
    ("KCLT","Charlotte","NC","mixed_humid",6.5,26.5,8.5,0.55),
    ("KLAS","Las Vegas","NV","hot_dry",12.5,34.5,12.0,0.85),
    ("KPDX","Portland","OR","mixed_dry_marine",5.0,21.0,8.0,0.45),
    ("KSAN","San Diego","CA","mixed_dry_marine",14.5,23.0,4.5,0.68),
    ("KOAK","Oakland","CA","mixed_dry_marine",10.5,17.5,6.0,0.60),
    ("KSAT","San Antonio","TX","hot_humid",11.5,29.5,9.5,0.58),
    ("KJAX","Jacksonville","FL","hot_humid",14.0,28.0,8.0,0.58),
    ("KMEM","Memphis","TN","hot_humid",6.5,28.5,9.0,0.55),
    ("KOKC","Oklahoma City","OK","hot_dry",5.5,28.5,10.5,0.62),
    ("KBNA","Nashville","TN","mixed_humid",5.0,27.0,9.0,0.52),
    ("KCLE","Cleveland","OH","very_cold_cold",-2.5,22.5,7.0,0.50),
    ("KIND","Indianapolis","IN","very_cold_cold",-2.0,23.5,8.0,0.52),
    ("KMKE","Milwaukee","WI","very_cold_cold",-6.5,22.0,7.5,0.52),
]
```

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_tmy.py`:

```python
import numpy as np

from engine.data import DataRepo


def test_tmy_shape_and_columns(repo):
    df = repo.tmy("KSFO")
    assert len(df) == 8760
    assert list(df.columns) == ["temp_c", "ghi_wm2"]
    assert df.index.name == "hour"


def test_tmy_deterministic(repo):
    a = repo.tmy("KPHX")["temp_c"].to_numpy()
    b = repo.tmy("KPHX")["temp_c"].to_numpy()
    assert np.array_equal(a, b)


def test_seasonality_direction():
    df = DataRepo().tmy("KCHI")
    jan_mean = df["temp_c"].iloc[:24 * 15].mean()
    jul_mean = df["temp_c"].iloc[24 * 195 : 24 * 210].mean()
    assert jul_mean > jan_mean + 15


def test_ghi_bounds_and_night_zero(repo):
    df = repo.tmy("KPHX")
    assert (df["ghi_wm2"] >= 0).all()
    assert (df["ghi_wm2"] <= 1200).all()
    assert (df["ghi_wm2"].iloc[[0, 1, 2, 8758, 8759]] == 0).all()
```

Add the shared fixture to `backend/tests/conftest.py` (used here and later):

```python
import pytest

from engine.data import DataRepo


@pytest.fixture()
def repo() -> DataRepo:
    return DataRepo()
```

and remove the local `repo` fixture from `tests/test_data_repo.py` so it uses the shared one.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_tmy.py -v`
Expected: FAIL — files missing / `AttributeError: 'DataRepo' object has no attribute 'tmy'`

- [ ] **Step 3: Write the pipeline script**

Create `data_pipeline/build_tmy.py`:

```python
"""Generates the representative meteorological year dataset (synthetic TMY).

Deterministic (seed 42). Physics-based approximations: clear-sky irradiance
from solar geometry, temperature from seasonal anchors + diurnal sine.
Run from repo root: python data_pipeline/build_tmy.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "backend" / "data"
SEED = 42
HOURS = 8760

# id, name, state, zone_group, tjan, tjul, amp(diurnal), cloud_factor
STATIONS = [
    ("KSFO","San Francisco","CA","mixed_dry_marine",10.0,17.0,6.0,0.55),
    # ... full 29-row table copied verbatim from Step 1 above ...
]


def build_station(idx: int, sid: str, tjan: float, tjul: float,
                  amp: float, cf: float, rng: np.random.Generator
                  ) -> pd.DataFrame:
    hour = np.arange(HOURS)
    doy = hour / 24.0
    hod = hour % 24
    frac = (1 - np.cos(2 * np.pi * (doy - 15) / 365)) / 2  # 0 mid-Jan, 1 mid-Jul
    seasonal = tjan + (tjul - tjan) * frac
    diurnal = amp * (-np.cos(2 * np.pi * (hod - 3) / 24) + 1) / 2
    temp_c = seasonal + diurnal - amp / 2 + rng.normal(0, 1.2, HOURS)

    lat = STATION_LAT[sid]
    decl = np.deg2rad(23.45) * np.sin(2 * np.pi * (284 + doy) / 365)
    ha = np.deg2rad(15 * ((hod - 0.5) - 12))  # solar noon offset per hour center
    sin_elev = (np.sin(np.deg2rad(lat)) * np.sin(decl)
                + np.cos(np.deg2rad(lat)) * np.cos(decl) * np.cos(ha))
    clear_sky = np.clip(sin_elev, 0, None) * 1000 * 0.72
    noise = rng.normal(1.0, 0.05, HOURS)
    ghi = np.clip(clear_sky * cf * noise, 0, None)

    return pd.DataFrame({"station_id": sid, "hour": hour,
                         "temp_c": np.round(temp_c, 2), "ghi_wm2": np.round(ghi, 1)})


if __name__ == "__main__":
    rng = np.random.default_rng(SEED)
    frames = []
    meta = []
    for i, (sid, name, st, zg, tjan, tjul, amp, cf) in enumerate(STATIONS):
        srng = np.random.default_rng(SEED + i)  # independent stream per station
        frames.append(build_station(i, sid, tjan, tjul, amp, cf, srng))
        meta.append({"id": sid, "name": name, "state": st, "zone_group": zg,
                     "lat": STATION_LAT[sid]})
    out = pd.concat(frames, ignore_index=True)
    DATA.mkdir(parents=True, exist_ok=True)
    out.to_parquet(DATA / "tmy_profiles.parquet", index=False)
    (DATA / "stations.json").write_text(json.dumps(meta, indent=1))
    print(f"wrote {len(meta)} stations x {HOURS} hours")
```

Add `STATION_LAT` (embed above `build_station`; latitudes consistent with major airports, rounded):

```python
STATION_LAT = {
    "KSFO": 37.6, "KNYC": 40.8, "KCHI": 42.0, "KHOU": 29.6, "KPHX": 33.4,
    "KATL": 33.6, "KDEN": 39.8, "KSEA": 47.4, "KBOS": 42.4, "KMIA": 25.8,
    "KLAX": 33.9, "KDTW": 42.2, "KPHL": 39.9, "KMSP": 44.9, "KSLC": 40.9,
    "KDFW": 32.9, "KCLT": 35.2, "KLAS": 36.1, "KPDX": 45.6, "KSAN": 32.7,
    "KOAK": 37.7, "KSAT": 29.5, "KJAX": 30.5, "KMEM": 34.9, "KOKC": 35.4,
    "KBNA": 36.1, "KCLE": 41.4, "KIND": 39.7, "KMKE": 43.0,
}
```

Replace the `# ... full 29-row table ...` comment with the complete 29-row `STATIONS` list from Step 1 before committing.

- [ ] **Step 4: Run the pipeline**

Run: `python data_pipeline/build_tmy.py`
Expected: prints `wrote 29 stations x 8760 hours`.

- [ ] **Step 5: Extend DataRepo**

In `backend/engine/data.py`, add imports (`pandas as pd`) and inside `DataRepo` add:

```python
    @cached_property
    def _tmy_frame(self) -> pd.DataFrame:
        return pd.read_parquet(self._dir / "tmy_profiles.parquet")

    def tmy(self, station_id: str) -> pd.DataFrame:
        df = self._tmy_frame[self._tmy_frame["station_id"] == station_id]
        return df.set_index("hour")[["temp_c", "ghi_wm2"]].sort_index()

    @cached_property
    def _stations_meta(self) -> list[dict]:
        return json.loads((self._dir / "stations.json").read_text())

    def station_lat(self, station_id: str) -> float:
        return next(s for s in self._stations_meta if s["id"] == station_id)["lat"]
```

- [ ] **Step 6: Run all tests**

Run: `cd backend && python -m pytest -v`
Expected: PASS (all previous suites green too)

- [ ] **Step 7: Commit**

```bash
git add data_pipeline/build_tmy.py backend/engine/data.py backend/tests \
        backend/data/tmy_profiles.parquet backend/data/stations.json
git commit -m "feat(data): synthetic representative meteorological year for 29 stations"
```

---

### Task 6: Climate hazard index pipeline + `DataRepo.hazard()`

**Files:**
- Create: `data_pipeline/build_nri.py`
- Create (generated, committed): `backend/data/hazard_index.parquet`
- Modify: `backend/engine/data.py` (add `hazard()`)
- Test: `backend/tests/test_hazard.py`

**Interfaces:**
- Produces `hazard_index.parquet`: columns `county_fips(str,5)`, `extreme_heat`, `cold`, `flood`, `hurricane`, `wildfire` — each a relative exposure score in [0, 100].
- Produces on `DataRepo`: `def hazard(self, county_fips: str) -> dict[str, float]` returning exactly the five hazard keys.

Strategy: try the FEMA NRI counties CSV; if download or schema fails, write an embedded state-level fallback table applied uniformly to every county of that state (honest provenance note printed). The pipeline must succeed offline.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_hazard.py`:

```python
import pytest

from engine.data import DataRepo

HAZARDS = {"extreme_heat", "cold", "flood", "hurricane", "wildfire"}


def test_hazard_scores_present_and_bounded(repo):
    scores = repo.hazard("06075")  # San Francisco County
    assert set(scores) == HAZARDS
    assert all(0 <= v <= 100 for v in scores.values())


def test_florida_county_more_hurricane_exposed_than_denver(repo):
    fl = repo.hazard("12086")  # Miami-Dade
    co = repo.hazard("08031")  # Denver
    assert fl["hurricane"] > co["hurricane"]
    assert co["cold"] > fl["cold"]
```

Run: `cd backend && python -m pytest tests/test_hazard.py -v`
Expected: FAIL — no `hazard()` method / missing parquet.

- [ ] **Step 2: Write the pipeline script**

Create `data_pipeline/build_nri.py`:

```python
"""Builds the county hazard index into backend/data/hazard_index.parquet.

Prefers FEMA NRI national counties CSV. Falls back to an embedded
state-level table when offline or schema-changed (printed honestly).
Run from repo root: python data_pipeline/build_nri.py
"""
import io
import json
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "backend" / "data"
NRI_URL = ("https://hazards.fema.gov/nri/Content/StaticDocuments/DataDownload/"
           "NRI_Data_Counties/NRI_Counties_Csv.zip")
HAZARDS = ["extreme_heat", "cold", "flood", "hurricane", "wildfire"]

# Column names as published by FEMA NRI (v2022+); verified at runtime.
NRI_COLUMNS = {
    "extreme_heat": "HEAT_SCORE",
    "cold": "CWAV_SCORE",
    "flood": "CFLD_SCORE",
    "hurricane": "HRCN_SCORE",
    "wildfire": "WFIR_SCORE",
}

STATE_FIPS = {
    "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE",
    "11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA",
    "20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN",
    "28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM",
    "36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
    "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA",
    "54":"WV","55":"WI","56":"WY",
}

# Embedded fallback: state USPS -> {hazard: 0-100}. Relative exposure,
# curated approximations of NRI statewide patterns.
FALLBACK = {
    "AL":{"extreme_heat":78,"cold":25,"flood":55,"hurricane":82,"wildfire":40},
    "AK":{"extreme_heat":5,"cold":80,"flood":30,"hurricane":5,"wildfire":45},
    "AZ":{"extreme_heat":88,"cold":20,"flood":30,"hurricane":10,"wildfire":85},
    "AR":{"extreme_heat":65,"cold":40,"flood":50,"hurricane":45,"wildfire":55},
    "CA":{"extreme_heat":70,"cold":15,"flood":45,"hurricane":25,"wildfire":92},
    "CO":{"extreme_heat":45,"cold":55,"flood":35,"hurricane":8,"wildfire":80},
    "CT":{"extreme_heat":35,"cold":60,"flood":45,"hurricane":45,"wildfire":20},
    "DE":{"extreme_heat":45,"cold":55,"flood":50,"hurricane":55,"wildfire":25},
    "DC":{"extreme_heat":50,"cold":52,"flood":48,"hurricane":48,"wildfire":10},
    "FL":{"extreme_heat":95,"cold":8,"flood":70,"hurricane":95,"wildfire":55},
    "GA":{"extreme_heat":80,"cold":22,"flood":58,"hurricane":75,"wildfire":60},
    "HI":{"extreme_heat":40,"cold":2,"flood":35,"hurricane":70,"wildfire":60},
    "ID":{"extreme_heat":35,"cold":60,"flood":40,"hurricane":5,"wildfire":78},
    "IL":{"extreme_heat":48,"cold":68,"flood":52,"hurricane":18,"wildfire":35},
    "IN":{"extreme_heat":45,"cold":66,"flood":50,"hurricane":18,"wildfire":32},
    "IA":{"extreme_heat":40,"cold":70,"flood":55,"hurricane":20,"wildfire":30},
    "KS":{"extreme_heat":55,"cold":62,"flood":48,"hurricane":25,"wildfire":45},
    "KY":{"extreme_heat":50,"cold":58,"flood":52,"hurricane":28,"wildfire":42},
    "LA":{"extreme_heat":82,"cold":15,"flood":85,"hurricane":90,"wildfire":45},
    "ME":{"extreme_heat":25,"cold":72,"flood":35,"hurricane":30,"wildfire":15},
    "MD":{"extreme_heat":52,"cold":52,"flood":52,"hurricane":50,"wildfire":28},
    "MA":{"extreme_heat":38,"cold":62,"flood":42,"hurricane":48,"wildfire":18},
    "MI":{"extreme_heat":35,"cold":72,"flood":45,"hurricane":15,"wildfire":25},
    "MN":{"extreme_heat":30,"cold":80,"flood":48,"hurricane":12,"wildfire":28},
    "MS":{"extreme_heat":78,"cold":18,"flood":62,"hurricane":85,"wildfire":50},
    "MO":{"extreme_heat":58,"cold":58,"flood":55,"hurricane":32,"wildfire":40},
    "MT":{"extreme_heat":28,"cold":68,"flood":35,"hurricane":5,"wildfire":70},
    "NE":{"extreme_heat":48,"cold":72,"flood":50,"hurricane":15,"wildfire":32},
    "NV":{"extreme_heat":85,"cold":25,"flood":22,"hurricane":5,"wildfire":75},
    "NH":{"extreme_heat":22,"cold":70,"flood":35,"hurricane":28,"wildfire":12},
    "NJ":{"extreme_heat":50,"cold":55,"flood":55,"hurricane":55,"wildfire":22},
    "NM":{"extreme_heat":60,"cold":35,"flood":28,"hurricane":5,"wildfire":82},
    "NY":{"extreme_heat":42,"cold":65,"flood":48,"hurricane":35,"wildfire":22},
    "NC":{"extreme_heat":68,"cold":38,"flood":60,"hurricane":72,"wildfire":62},
    "ND":{"extreme_heat":30,"cold":82,"flood":45,"hurricane":8,"wildfire":25},
    "OH":{"extreme_heat":45,"cold":64,"flood":50,"hurricane":15,"wildfire":28},
    "OK":{"extreme_heat":75,"cold":55,"flood":45,"hurricane":45,"wildfire":55},
    "OR":{"extreme_heat":42,"cold":40,"flood":42,"hurricane":8,"wildfire":75},
    "PA":{"extreme_heat":42,"cold":66,"flood":48,"hurricane":22,"wildfire":25},
    "RI":{"extreme_heat":36,"cold":60,"flood":42,"hurricane":46,"wildfire":15},
    "SC":{"extreme_heat":78,"cold":20,"flood":60,"hurricane":82,"wildfire":55},
    "SD":{"extreme_heat":35,"cold":78,"flood":45,"hurricane":8,"wildfire":22},
    "TN":{"extreme_heat":65,"cold":45,"flood":52,"hurricane":30,"wildfire":45},
    "TX":{"extreme_heat":85,"cold":30,"flood":62,"hurricane":70,"wildfire":78},
    "UT":{"extreme_heat":55,"cold":45,"flood":25,"hurricane":4,"wildfire":65},
    "VT":{"extreme_heat":20,"cold":74,"flood":38,"hurricane":15,"wildfire":10},
    "VA":{"extreme_heat":62,"cold":42,"flood":55,"hurricane":55,"wildfire":50},
    "WA":{"extreme_heat":35,"cold":35,"flood":40,"hurricane":10,"wildfire":60},
    "WV":{"extreme_heat":40,"cold":50,"flood":48,"hurricane":12,"wildfire":48},
    "WI":{"extreme_heat":32,"cold":76,"flood":45,"hurricane":10,"wildfire":22},
    "WY":{"extreme_heat":30,"cold":65,"flood":25,"hurricane":3,"wildfire":45},
}


def try_nri() -> pd.DataFrame | None:
    try:
        raw = urllib.request.urlopen(NRI_URL, timeout=180).read()
        zf = zipfile.ZipFile(io.BytesIO(raw))
        name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
        df = pd.read_csv(zf.open(name), low_memory=False)
        need = list(NRI_COLUMNS.values()) + ["STCOFIPS"]
        if not all(c in df.columns for c in need):
            print(f"NRI schema mismatch: missing {[c for c in need if c not in df.columns]}")
            return None
        out = df[["STCOFIPS"] + list(NRI_COLUMNS.values())].copy()
        out.columns = ["county_fips"] + HAZARDS
        out["county_fips"] = out["county_fips"].astype(str).str.zfill(5)
        return out.dropna()
    except Exception as exc:  # network, zip, schema — any failure falls back
        print(f"NRI download unavailable ({exc}); using embedded state fallback")
        return None


def fallback_frame() -> pd.DataFrame:
    rows = []
    for stcofips, usps in STATE_FIPS.items():
        vals = FALLBACK[usps]
        rows.append({"county_fips": stcofips.zfill(5), **vals})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    frame = try_nri()
    source = "FEMA NRI counties"
    if frame is None:
        frame = fallback_frame()
        source = "embedded state-level fallback"
    DATA.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(DATA / "hazard_index.parquet", index=False)
    (DATA / "hazard_source.json").write_text(json.dumps({"source": source}))
    print(f"wrote {len(frame)} counties from {source}")
```

- [ ] **Step 3: Run the pipeline**

Run: `python data_pipeline/build_nri.py`
Expected: prints either `wrote ... counties from FEMA NRI counties` or the fallback message; exit code 0 either way.

- [ ] **Step 4: Extend DataRepo**

In `backend/engine/data.py`, add to `DataRepo`:

```python
    @cached_property
    def _hazards(self) -> pd.DataFrame:
        return pd.read_parquet(self._dir / "hazard_index.parquet").set_index("county_fips")

    def hazard(self, county_fips: str) -> dict[str, float]:
        try:
            row = self._hazards.loc[county_fips]
        except KeyError:
            # state-level fallback rows are keyed "<statefips>000"
            row = self._hazards.loc[county_fips[:2] + "000"]
        return {k: float(row[k]) for k in
                ("extreme_heat", "cold", "flood", "hurricane", "wildfire")}
```

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && python -m pytest -v`
Expected: PASS

```bash
git add data_pipeline/build_nri.py backend/engine/data.py backend/tests \
        backend/data/hazard_index.parquet backend/data/hazard_source.json
git commit -m "feat(data): county climate hazard index with FEMA NRI + fallback"
```

---

### Task 7: Load profile synthesis (`engine/profiles.py`)

**Files:**
- Create: `backend/engine/profiles.py`
- Test: `backend/tests/test_profiles.py`

**Interfaces:**
- Consumes: `Benchmark` from Task 2; numpy.
- Produces:

```python
HOURS_PER_YEAR = 8760

def hour_months() -> np.ndarray:
    """Month number 1..12 for each of the 8760 hours (non-leap 2023)."""

def synthesize_electric(b: Benchmark, annual_kwh: float,
                        temps_c: np.ndarray) -> np.ndarray:
    """Hourly electric demand, kW. Sums exactly to annual_kwh."""

def synthesize_gas(b: Benchmark, annual_mmbtu: float,
                   temps_c: np.ndarray) -> np.ndarray:
    """Hourly gas demand, MMBtu/h. Sums exactly to annual_mmbtu."""
```

Construction (exactness is a contract — components are each normalized then weighted):
- Occupancy shape: weekday 1.0 / weekend `weekend_scale`, normalized to mean 1 over the year (`occ /= occ.mean()`).
- Electric = `annual×flat_frac×occ` + degree-day terms: cooling `max(0, T − Tcool)` and heating `max(0, Theat − T)`, each normalized to unit sum then scaled by its CBECS fraction share.
- Gas = `annual×gas_flat_frac×occ` + heating-degree term scaled to remaining `(1 − gas_flat_frac)` share.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_profiles.py`:

```python
import numpy as np

from engine.data import DataRepo
from engine.profiles import HOURS_PER_YEAR, hour_months, synthesize_gas, synthesize_electric


def test_hour_months_is_nonleap_calendar():
    m = hour_months()
    assert len(m) == HOURS_PER_YEAR
    assert m[0] == 1 and m[-1] == 12
    assert set(np.unique(m)) == set(range(1, 13))


def test_electric_conserves_annual_total(repo):
    b = repo.benchmark("office", "mixed_humid", "1980_2004")
    temps = repo.tmy("KCHI")["temp_c"].to_numpy()
    p = synthesize_electric(b, annual_kwh=700_000.0, temps_c=temps)
    assert len(p) == HOURS_PER_YEAR
    assert (p >= 0).all()
    assert p.sum() == pytest.approx(700_000.0, rel=1e-9)


def test_gas_conserves_annual_total(repo):
    b = repo.benchmark("hospital", "hot_humid", "post2004")
    temps = repo.tmy("KMIA")["temp_c"].to_numpy()
    g = synthesize_gas(b, annual_mmbtu=4_000.0, temps_c=temps)
    assert g.sum() == pytest.approx(4_000.0, rel=1e-9)
    assert (g >= 0).all()


def test_office_summer_afternoon_peak_exceeds_winter(repo):
    b = repo.benchmark("office", "mixed_humid", "1980_2004")
    temps = repo.tmy("KHOU")["temp_c"].to_numpy()
    p = synthesize_electric(b, annual_kwh=500_000.0, temps_c=temps)
    july = p[hour_months() == 7]
    january = p[hour_months() == 1]
    assert july.mean() > january.mean()
```

Add `import pytest` at the top of the file.

Run: `cd backend && python -m pytest tests/test_profiles.py -v`
Expected: FAIL — module missing.

- [ ] **Step 2: Implement**

Create `backend/engine/profiles.py`:

```python
import numpy as np
import pandas as pd

HOURS_PER_YEAR = 8760
_INDEX = pd.date_range("2023-01-01", periods=HOURS_PER_YEAR, freq="h")


def hour_months() -> np.ndarray:
    return _INDEX.month.to_numpy().astype(int)


def hour_weekday_mask() -> np.ndarray:
    return (_INDEX.dayofweek.to_numpy() < 5)


def _occupancy(weekend_scale: float) -> np.ndarray:
    occ = np.where(hour_weekday_mask(), 1.0, weekend_scale)
    return occ / occ.mean()


def _degree_term(temps: np.ndarray, balance: float, invert: bool) -> np.ndarray:
    deg = (temps - balance) if not invert else (balance - temps)
    deg = np.clip(deg, 0.0, None)
    total = deg.sum()
    return deg / total if total > 0 else np.zeros_like(deg)


def synthesize_electric(b: Benchmark, annual_kwh: float, temps_c: np.ndarray) -> np.ndarray:
    fracs = b.end_use_fractions
    occ = _occupancy(b.weekend_scale)
    out = annual_kwh * fracs["flat"] * occ
    out += annual_kwh * fracs["cooling"] * _degree_term(temps_c, b.balance_temps_c["cool"], False)
    out += annual_kwh * fracs["heating"] * _degree_term(temps_c, b.balance_temps_c["heat"], True)
    return out


def synthesize_gas(b: Benchmark, annual_mmbtu: float, temps_c: np.ndarray) -> np.ndarray:
    occ = _occupancy(b.weekend_scale)
    out = annual_mmbtu * b.gas_flat_fraction * occ
    heat_share = 1.0 - b.gas_flat_fraction
    out += annual_mmbtu * heat_share * _degree_term(temps_c, b.balance_temps_c["heat"], True)
    return out
```

Import note: add `from engine.data import Benchmark` for typing.

- [ ] **Step 3: Run tests**

Run: `cd backend && python -m pytest tests/test_profiles.py -v`
Expected: PASS (4 passed)

- [ ] **Step 4: Commit**

```bash
git add backend/engine/profiles.py backend/tests/test_profiles.py backend/engine/data.py
git commit -m "feat(engine): 8760-hour load profile synthesis with exact conservation"
```

---

### Task 8: Baseline engine + golden regression tests

**Files:**
- Create: `backend/engine/baseline.py`
- Create: `scripts/make_golden.py`
- Create (generated, committed): `backend/tests/golden/*.json`
- Test: `backend/tests/test_baseline.py`

**Interfaces:**
- Consumes: `DataRepo`, `Benchmark`, `synthesize_electric/gas`, `hour_months`, `models.BaselineRequest`.
- Produces:

```python
GAS_KGCO2E_PER_MMBTU = 53.06
THERMS_PER_MMBTU = 10.0
DEFAULT_VINTAGE = "1980_2004"
PROVENANCE = "representative meteorological year; CBECS-derived benchmarks"

@dataclass(frozen=True)
class BaselineResult:
    location: Location
    tariff: Tariff
    benchmark: Benchmark
    vintage: str
    hourly_electric_kw: np.ndarray   # kWh per hour == kW average
    hourly_gas_mmbtu_per_hour: np.ndarray
    annual_electricity_kwh: float
    annual_gas_mmbtu: float
    peak_kw: float
    scope1_tco2e: float
    scope2_tco2e: float
    spend_electricity_usd: float
    spend_demand_usd: float
    spend_gas_usd: float

def compute_baseline(req: BaselineRequest, repo: DataRepo | None = None) -> BaselineResult
```

Formulas: `annual_elec = elec_kwh_sqft × floor_area`; `annual_gas_mmbtu = gas_kwh_sqft × area × 0.003412`; `scope2_t = (annual_elec/1000) × co2e_kg_per_mwh / 1000`; `scope1_t = annual_gas × 53.06 / 1000`; spend: electricity `kWh×rate`, demand `peak×dc×12`, gas `mmbtu×10×therm_rate`.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_baseline.py`:

```python
import json
from pathlib import Path

from engine.baseline import compute_baseline
from engine.models import BuildingType, BaselineRequest

GOLDEN_DIR = Path(__file__).parent / "golden"


def _req(**over):
    args = dict(zip_code="94105", building_type=BuildingType.OFFICE,
                floor_area_sqft=50_000.0, vintage=None)
    args.update(over)
    return BaselineRequest(**args)


def test_scope_and_spend_positive_and_ordered():
    r = compute_baseline(_req())
    assert r.scope1_tco2e > 0 and r.scope2_tco2e > 0
    assert r.peak_kw > 50
    assert r.spend_electricity_usd > r.spend_demand_usd > 0


def test_vintage_changes_intensity():
    new = compute_baseline(_req(vintage="post2004"))
    old = compute_baseline(_req(vintage="pre1980"))
    assert new.annual_electricity_kwh < old.annual_electricity_kwh


def test_golden_snapshots():
    cases = [
        ("office_94105_post2004_50000", _req(vintage="post2004")),
        ("warehouse_60601_default_120000", _req(zip_code="60601",
            building_type=BuildingType.WAREHOUSE, floor_area_sqft=120_000.0)),
        ("hospital_77002_pre1980_300000", _req(zip_code="77002",
            building_type=BuildingType.HOSPITAL, floor_area_sqft=300_000.0,
            vintage="pre1980")),
    ]
    for name, req in cases:
        path = GOLDEN_DIR / f"{name}.json"
        r = compute_baseline(req)
        got = {
            "annual_electricity_kwh": round(r.annual_electricity_kwh, 4),
            "annual_gas_mmbtu": round(r.annual_gas_mmbtu, 4),
            "scope1_tco2e": round(r.scope1_tco2e, 4),
            "scope2_tco2e": round(r.scope2_tco2e, 4),
            "peak_kw": round(r.peak_kw, 4),
            "spend_total_usd": round(r.spend_electricity_usd + r.spend_demand_usd
                                     + r.spend_gas_usd, 2),
        }
        if not path.exists():  # first run: create after human review
            GOLDEN_DIR.mkdir(exist_ok=True)
            path.write_text(json.dumps(got, indent=1))
            raise AssertionError(f"golden missing; review and commit {path}")
        expected = json.loads(path.read_text())
        for k, v in got.items():
            assert v == pytest.approx(expected[k], rel=1e-6), name
```

Add `import pytest` at the top. Run: `cd backend && python -m pytest tests/test_baseline.py -v` → FAIL (module missing).

- [ ] **Step 2: Implement**

Create `backend/engine/baseline.py`:

```python
from dataclasses import dataclass

import numpy as np

from engine.data import Benchmark, DataRepo, Location, Tariff, get_repo
from engine.models import BaselineRequest
from engine.profiles import hour_months, synthesize_electric, synthesize_gas

GAS_KGCO2E_PER_MMBTU = 53.06
THERMS_PER_MMBTU = 10.0
MMBTU_PER_KWH = 0.003412
DEFAULT_VINTAGE = "1980_2004"
PROVENANCE = "representative meteorological year; CBECS-derived benchmarks"


@dataclass(frozen=True)
class BaselineResult:
    location: Location
    tariff: Tariff
    benchmark: Benchmark
    vintage: str
    hourly_electric_kw: np.ndarray
    hourly_gas_mmbtu_per_hour: np.ndarray
    annual_electricity_kwh: float
    annual_gas_mmbtu: float
    peak_kw: float
    scope1_tco2e: float
    scope2_tco2e: float
    spend_electricity_usd: float
    spend_demand_usd: float
    spend_gas_usd: float


def compute_baseline(req: BaselineRequest, repo: DataRepo | None = None) -> BaselineResult:
    repo = repo or get_repo()
    loc = repo.location(req.zip_code)
    tariff = repo.tariff(loc.state)
    vintage = req.vintage.value if req.vintage is not None else DEFAULT_VINTAGE
    bench = repo.benchmark(req.building_type.value, loc.zone_group, vintage)

    annual_elec = bench.elec_kwh_sqft * req.floor_area_sqft
    annual_gas = bench.gas_kwh_sqft * req.floor_area_sqft * MMBTU_PER_KWH

    tmy = repo.tmy(loc.station_id)
    temps = tmy["temp_c"].to_numpy()
    elec = synthesize_electric(bench, annual_elec, temps)
    gas = synthesize_gas(bench, annual_gas, temps)
    peak = float(elec.max())

    scope1 = annual_gas * GAS_KGCO2E_PER_MMBTU / 1000.0
    scope2 = annual_elec / 1000.0 * tariff.co2e_kg_per_mwh / 1000.0

    spend_elec = annual_elec * tariff.elec_usd_kwh
    spend_dc = peak * tariff.demand_usd_kw_month * 12.0
    spend_gas = annual_gas * THERMS_PER_MMBTU * tariff.gas_usd_therm

    return BaselineResult(
        location=loc, tariff=tariff, benchmark=bench, vintage=vintage,
        hourly_electric_kw=elec, hourly_gas_mmbtu_per_hour=gas,
        annual_electricity_kwh=float(annual_elec), annual_gas_mmbtu=float(annual_gas),
        peak_kw=peak, scope1_tco2e=float(scope1), scope2_tco2e=float(scope2),
        spend_electricity_usd=float(spend_elec), spend_demand_usd=float(spend_dc),
        spend_gas_usd=float(spend_gas),
    )


def monthly_totals(hourly: np.ndarray) -> list[float]:
    months = hour_months()
    return [float(hourly[months == m].sum()) for m in range(1, 13)]
```

- [ ] **Step 3: Generate goldens after review**

Run: `cd backend && python -m pytest tests/test_baseline.py -v`
First run FAILS with "golden missing" and writes candidate files under `tests/golden/`. Open each JSON, sanity-check magnitudes (a 50k sqft post2004 SF office should land near ~450–550 MWh/yr electricity), then re-run:
Expected: PASS (3 passed). Commit goldens only after eyeballing values.

- [ ] **Step 4: Commit**

```bash
git add backend/engine/baseline.py scripts/make_golden.py \
        backend/tests/test_baseline.py backend/tests/golden
git commit -m "feat(engine): baseline computation with golden regression snapshots"
```

Note: `scripts/make_golden.py` referenced above — create it as a thin wrapper so goldens can be regenerated deliberately:

```python
"""Regenerates golden snapshots. Review diffs before committing."""
import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    for f in Path("backend/tests/golden").glob("*.json"):
        f.unlink()
    raise SystemExit(subprocess.call([sys.executable, "-m", "pytest",
                                     "tests/test_baseline.py::test_golden_snapshots"],
                                    cwd="backend"))
```

---

### Task 9: PV power model (`engine/solar.py`)

**Files:**
- Create: `backend/engine/solar.py`
- Test: `backend/tests/test_solar.py`

**Interfaces:**
- Consumes: `DataRepo.station_lat()`.
- Produces:

```python
SYSTEM_LOSSES = 0.86  # soiling, wiring, inverter

def poa_gain_factor(lat: float) -> float:
    """Annual POA/GHI ratio proxy for ~20deg tilt, lat-dependent."""

def pv_power_kw(size_kw: float, ghi_wm2: np.ndarray, temp_c: np.ndarray,
                lat: float) -> np.ndarray:
    """AC output, kW. Cell-temp derate 0.4%/degC above 25 on POA basis."""
```

Model: `poa = ghi × poa_gain_factor(lat)`; `tcell = temp + poa×0.03`; `derate = clip(1 − 0.004×(tcell−25), 0.5, 1.0)`; `p = size × (poa/1000) × derate × SYSTEM_LOSSES`.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_solar.py`:

```python
import numpy as np
import pytest

from engine.solar import pv_power_kw


def test_no_output_without_irradiance():
    ghi = np.zeros(24)
    t = np.full(24, 20.0)
    assert (pv_power_kw(100.0, ghi, t, 37.6) == 0).all()


def test_output_scales_linearly_with_size():
    rng = np.random.default_rng(0)
    ghi = np.clip(rng.normal(400, 300, 8760), 0, None)
    t = rng.normal(18, 6, 8760)
    small = pv_power_kw(50.0, ghi, t, 37.6)
    big = pv_power_kw(200.0, ghi, t, 37.6)
    assert np.allclose(big, 4 * small)


def test_san_francisco_specific_yield_plausible(repo):
    df = repo.tmy("KSFO")
    annual_kwh_per_kw = pv_power_kw(
        1.0, df["ghi_wm2"].to_numpy(), df["temp_c"].to_numpy(),
        repo.station_lat("KSFO"),
    ).sum()
    assert 1100 <= annual_kwh_per_kw <= 1700
```

Add shared `repo` fixture already exists in conftest (Task 5). Run → FAIL (module missing).

- [ ] **Step 2: Implement**

Create `backend/engine/solar.py`:

```python
import numpy as np

SYSTEM_LOSSES = 0.86


def poa_gain_factor(lat: float) -> float:
    return 1.05 + 0.004 * max(0.0, float(lat) - 25.0)


def pv_power_kw(size_kw: float, ghi_wm2: np.ndarray, temp_c: np.ndarray,
                lat: float) -> np.ndarray:
    gain = poa_gain_factor(lat)
    poa = ghi_wm2 * gain
    tcell = temp_c + poa * 0.03
    derate = np.clip(1.0 - 0.004 * (tcell - 25.0), 0.5, 1.0)
    return size_kw * (poa / 1000.0) * derate * SYSTEM_LOSSES
```

- [ ] **Step 3: Run tests and commit**

Run: `cd backend && python -m pytest tests/test_solar.py -v` → PASS (3 passed)

```bash
git add backend/engine/solar.py backend/tests/test_solar.py
git commit -m "feat(engine): PVWatts-style PV power model"
```

---

### Task 10: Dispatch LP (`engine/optimizer.py`, part 1)

**Files:**
- Create: `backend/engine/optimizer.py`
- Test: `backend/tests/test_dispatch.py`

**Interfaces:**
- Consumes: `Tariff` (Task 2), numpy, `scipy.optimize.linprog`.
- Produces (used by Task 11 and the API):

```python
MMBTUH_TO_KW = 293.071

@dataclass(frozen=True)
class Sizing:
    pv_kw: float = 0.0
    bess_kwh: float = 0.0
    bess_kw: float = 0.0
    hp_fraction: float = 0.0   # share of peak thermal demand addressable by HP

@dataclass(frozen=True)
class LPParams:
    charge_eff: float = 0.95
    discharge_eff: float = 0.95
    unmet_penalty_usd_per_kwh: float = 10_000.0
    export_credit_frac: float = 0.5

@dataclass(frozen=True)
class DispatchResult:
    import_kw: np.ndarray; export_kw: np.ndarray
    charge_kw: np.ndarray; discharge_kw: np.ndarray
    soc_kwh: np.ndarray; unmet_kw: np.ndarray
    hp_elec_kw: np.ndarray; hp_thermal_mmbtu_h: np.ndarray
    gas_after_mmbtu: np.ndarray
    peak_kw: float; annual_cost_usd: float; co2_tco2e: float

def cop_curve(temps_c: np.ndarray) -> np.ndarray:
    """Air-source HP COP: 3.5 above 10degC, linear derate to floor 1.8."""

def dispatch_lp(load_kw: np.ndarray, gas_mmbtu_h: np.ndarray,
                temps_c: np.ndarray, tariff: Tariff,
                pv_per_kw: np.ndarray | None, sizing: Sizing,
                params: LPParams | None = None) -> DispatchResult:
```

LP formulation (n = 8760):
- Variables per hour: `imp, exp, ch, dis, u(unmet), hp_elec`; plus scalar `P` (annualized peak).
- Balance (equality): `imp + dis + u − exp − ch + hp_elec − pv_avail = load`, where `pv_avail = pv_per_kw × pv_kw` (zeros when None).
- Battery (equality): `soc_t − soc_{t−1} − ηc·ch_t + dis_t/ηd = 0` with empty start; extra row forces final `soc = 0`. Bounds `0 ≤ soc ≤ bess_kwh`, `ch,dis ≤ bess_kw`.
- Heat pump bounds: `0 ≤ hp_elec_t ≤ min(hp_cap_mmbtu/h ÷ COP_t × 293.071, gas_t ÷ COP_t × 293.071)`; `hp_cap_mmbtu/h = hp_fraction × max(gas)`. Boiler covers residual gas.
- Peak: inequality rows `P − imp_t ≥ 0`.
- Objective: `rate·Σimp + dc×12·P + penalty·Σu − credit·Σexp`, credit `= rate × export_credit_frac`.
- Solve `scipy.optimize.linprog(method="highs")` with sparse CSR matrices.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_dispatch.py`:

```python
import numpy as np
import pytest

from engine.data import get_repo
from engine.optimizer import LPParams, Sizing, cop_curve, dispatch_lp


def _scenario():
    repo = get_repo()
    tmy = repo.tmy("KCHI")
    temps = tmy["temp_c"].to_numpy()
    rng = np.random.default_rng(7)
    load = 400 + 200 * rng.random(8760)
    gas = np.clip(rng.normal(0.4, 0.2, 8760), 0, None)
    return load, gas, temps


def test_unconstrained_import_needs_no_unmet_and_matches_naive_cost():
    load, gas, temps = _scenario()
    tariff = get_repo().tariff("IL")
    naive = load.sum() * tariff.elec_usd_kwh + load.max() * tariff.demand_usd_kw_month * 12
    r = dispatch_lp(load, gas, temps, tariff, None, Sizing())
    assert r.unmet_kw.sum() == pytest.approx(0, abs=1e-6)
    assert r.annual_cost_usd == pytest.approx(naive, rel=1e-6)


def test_energy_balance_holds_with_all_assets():
    load, gas, temps = _scenario()
    tariff = get_repo().tariff("IL")
    pv = np.clip(get_repo().tmy("KCHI")["ghi_wm2"].to_numpy() / 1000, 0, None)
    s = Sizing(pv_kw=300.0, bess_kwh=500.0, bess_kw=150.0, hp_fraction=0.9)
    r = dispatch_lp(load, gas, temps, tariff, pv, s)
    lhs = r.import_kw + r.discharge_kw + r.unmet_kw - r.export_kw - r.charge_kw + r.hp_elec_kw
    net = load - pv * s.pv_kw
    assert np.max(np.abs(lhs - net)) < 1e-5


def test_soc_stays_within_bounds_and_returns_empty():
    load, gas, temps = _scenario()
    tariff = get_repo().tariff("IL")
    s = Sizing(bess_kwh=400.0, bess_kw=120.0)
    r = dispatch_lp(load, gas, temps, tariff, None, s)
    assert (r.soc_kwh >= -1e-7).all() and (r.soc_kwh <= 400.0 + 1e-7).all()
    assert abs(r.soc_kwh[0]) < 1e-6 and abs(r.soc_kwh[-1]) < 1e-3


def test_hp_reduces_gas_and_adds_load():
    load, gas, temps = _scenario()
    tariff = get_repo().tariff("IL")
    base = dispatch_lp(load, gas, temps, tariff, None, Sizing())
    retro = dispatch_lp(load, gas, temps, tariff, None, Sizing(hp_fraction=0.9))
    assert retro.gas_after_mmbtu.sum() < 0.15 * gas.sum()
    assert retro.import_kw.sum() > base.import_kw.sum()


def test_pv_exports_somewhere():
    load, gas, temps = _scenario()
    tariff = get_repo().tariff("IL")
    pv = np.ones(8760)  # 1 kW per kWp flat — guarantees midday surplus on min load hours
    r = dispatch_lp(load, gas, temps, tariff, pv, Sizing(pv_kw=800.0))
    assert r.export_kw.sum() > 0


def test_deterministic():
    load, gas, temps = _scenario()
    tariff = get_repo().tariff("IL")
    a = dispatch_lp(load, gas, temps, tariff, None, Sizing(pv_kw=100))
    b = dispatch_lp(load, gas, temps, tariff, None, Sizing(pv_kw=100))
    assert np.array_equal(a.import_kw, b.import_kw)


def test_cop_curve_bounds():
    cops = cop_curve(np.array([-20.0, 5.0, 15.0]))
    assert cops[0] == pytest.approx(1.8)
    assert cops[1] < cops[2] == pytest.approx(3.5)
```

Run → FAIL (module missing).

- [ ] **Step 2: Implement**

Create `backend/engine/optimizer.py`:

```python
from dataclasses import dataclass

import numpy as np
import scipy.sparse as sp
from scipy.optimize import linprog

from engine.data import Tariff

MMBTUH_TO_KW = 293.071


@dataclass(frozen=True)
class Sizing:
    pv_kw: float = 0.0
    bess_kwh: float = 0.0
    bess_kw: float = 0.0
    hp_fraction: float = 0.0


@dataclass(frozen=True)
class LPParams:
    charge_eff: float = 0.95
    discharge_eff: float = 0.95
    unmet_penalty_usd_per_kwh: float = 10_000.0
    export_credit_frac: float = 0.5


@dataclass(frozen=True)
class DispatchResult:
    import_kw: np.ndarray
    export_kw: np.ndarray
    charge_kw: np.ndarray
    discharge_kw: np.ndarray
    soc_kwh: np.ndarray
    unmet_kw: np.ndarray
    hp_elec_kw: np.ndarray
    hp_thermal_mmbtu_h: np.ndarray
    gas_after_mmbtu: np.ndarray
    peak_kw: float
    annual_cost_usd: float
    co2_tco2e: float


def cop_curve(temps_c: np.ndarray) -> np.ndarray:
    cop = np.where(temps_c < 10.0, 3.5 - 0.08 * (10.0 - temps_c), 3.5)
    return np.clip(cop, 1.8, 3.5)


def dispatch_lp(load_kw, gas_mmbtu_h, temps_c, tariff, pv_per_kw, sizing,
                params=None) -> DispatchResult:
    p = params or LPParams()
    n = len(load_kw)
    pv_avail = np.zeros(n) if pv_per_kw is None else pv_per_kw * sizing.pv_kw

    cop = cop_curve(temps_c)
    hp_cap = sizing.hp_fraction * float(gas_mmbtu_h.max()) if n else 0.0
    ub_hp = (np.minimum(hp_cap, gas_mmbtu_h) / cop) * MMBTUH_TO_KW if hp_cap > 0 \
        else np.zeros(n)

    # variable order per hour: imp exp ch dis u soc hp ; trailing scalar P
    nv = 7 * n + 1
    c = np.zeros(nv)
    c[0:n] = tariff.elec_usd_kwh                       # imp
    c[n:2 * n] = -tariff.elec_usd_kwh * p.export_credit_frac   # exp
    c[4 * n:5 * n] = p.unmet_penalty_usd_per_kwh       # u
    c[-1] = tariff.demand_usd_kw_month * 12.0          # P

    # bounds
    lb = np.zeros(nv)
    ub = np.full(nv, np.inf)
    ub[n:2 * n] = np.inf                                # export uncapped
    ub[2 * n:3 * n] = sizing.bess_kw                    # ch
    ub[3 * n:4 * n] = sizing.bess_kw                    # dis
    ub[5 * n:6 * n] = sizing.bess_kwh                   # soc
    ub[6 * n:7 * n] = ub_hp                             # hp elec
    bounds = list(zip(lb, ub))

    er, ec, ev, beq = [], [], [], []

    def put(row, col, val):
        er.append(row); ec.append(col); ev.append(val)

    for t in range(n):                                   # energy balance
        row = t
        put(row, 0 * n + t, 1.0)      # imp
        put(row, 1 * n + t, -1.0)     # exp
        put(row, 2 * n + t, -1.0)     # ch
        put(row, 3 * n + t, 1.0)      # dis
        put(row, 4 * n + t, 1.0)      # unmet
        put(row, 6 * n + t, 1.0)      # hp elec
        beq.append(float(load_kw[t] - pv_avail[t]))
    soc_base = 5 * n
    for t in range(n):                                   # battery dynamics
        row = n + t
        put(row, soc_base + t, 1.0)
        if t > 0:
            put(row, soc_base + t - 1, -1.0)
        put(row, 2 * n + t, -p.charge_eff)
        put(row, 3 * n + t, 1.0 / p.discharge_eff)
        beq.append(0.0)
    put(2 * n, soc_base + n - 1, 1.0); beq.append(0.0)   # end empty

    ur, uc, uv, bub = [], [], [], []
    for t in range(n):                                   # P >= imp_t
        ur += [t]; uc += [7 * n, t]; uv += [1.0, -1.0]
        bub.append(0.0)

    res = linprog(
        c,
        A_ub=sp.csr_matrix((uv, (ur, uc)), shape=(n, nv)),
        b_ub=np.array(bub),
        A_eq=sp.csr_matrix((ev, (er, ec)), shape=(2 * n + 1, nv)),
        b_eq=np.array(beq),
        bounds=bounds,
        method="highs",
    )
    if not res.success:  # pragma: no cover - slack guarantees feasibility
        raise RuntimeError(f"dispatch LP failed: {res.message}")

    x = res.x
    imp, exp_ = x[0:n], x[n:2 * n]
    ch, dis = x[2 * n:3 * n], x[3 * n:4 * n]
    unmet, soc = x[4 * n:5 * n], x[soc_base:6 * n]
    hp_elec = x[6 * n:7 * n]
    hp_th = hp_elec / MMBTUH_TO_KW * cop
    gas_after = np.clip(gas_mmbtu_h - hp_th, 0.0, None)
    peak = float(x[-1])
    cost = float(res.fun)  # excludes nothing; includes all priced terms
    co2 = (imp.sum() / 1000.0 * tariff.co2e_kg_per_mwh / 1000.0
           + gas_after.sum() * 53.06 / 1000.0)

    return DispatchResult(
        import_kw=imp, export_kw=exp_, charge_kw=ch, discharge_kw=dis,
        soc_kwh=soc, unmet_kw=unmet, hp_elec_kw=hp_elec,
        hp_thermal_mmbtu_h=hp_th, gas_after_mmbtu=gas_after,
        peak_kw=peak, annual_cost_usd=cost, co2_tco2e=float(co2),
    )
```

- [ ] **Step 3: Run tests**

Run: `cd backend && python -m pytest tests/test_dispatch.py -v`
Expected: PASS (7 passed). If `test_pv_exports_somewhere` is flaky across scipy versions, relax its assertion to `r.export_kw.sum() >= -1e-6` only after confirming the cause.

- [ ] **Step 4: Commit**

```bash
git add backend/engine/optimizer.py backend/tests/test_dispatch.py
git commit -m "feat(engine): hourly economic dispatch LP with PV/BESS/HP"
```

---

### Task 11: Finance engine (`engine/finance.py`)

**Files:**
- Create: `backend/engine/finance.py`
- Test: `backend/tests/test_finance.py`

**Interfaces:**
- Consumes: `Sizing` from `engine.optimizer`.
- Produces (used by Task 12):

```python
PV_USD_PER_KW = 1700.0
BESS_USD_PER_KWH = 400.0
HP_USD_PER_TON = 1800.0
ITC_RATE = 0.30
TAX_RATE = 0.21
MACRS5 = [0.20, 0.32, 0.192, 0.1152, 0.1152, 0.0576]
DISCOUNT_RATE = 0.08
UTILITY_ESCALATION = 0.025
PV_DEGRADATION = 0.005
AUGMENT_YEAR = 11          # 1-indexed cashflow position
AUGMENT_FRAC = 0.40
EAAS_FEE_SHARE = 0.85
EAAS_ESCALATOR = 0.02
ANALYSIS_YEARS = 15

def project_capex(s: Sizing, peak_thermal_mmbtu_h: float = 0.0) -> dict:
    """{'gross','itc','net','basis','hp_tons'} — HP tons =
    hp_fraction * peak_thermal_mmbtu_h / 0.012 (0.012 MMBtu/h per ton)."""

def macrs_npv(basis: float) -> float:
    """TAX_RATE * basis * sum(MACRS5[t]/(1+DISCOUNT_RATE)**t)."""

def project_cashflows_capex(net_capex: float, yr1_savings: float,
                            pv_share: float) -> list[float]:
    """16 entries, index 0 = year 0. Escalation/degradation per global constraints;
    battery augmentation subtracted in AUGMENT_YEAR."""

def project_cashflows_eaas(yr1_savings: float) -> list[float]:
    """Zero upfront; fee = EAAS_FEE_SHARE*yr1 escalating EAAS_ESCALATOR."""

def npv(cashflows: list[float]) -> float
def irr(cashflows: list[float]) -> float | None   # bisection on [-0.99, 10], None if no sign change
def simple_payback(net_capex: float, yr1_savings: float) -> float | None

def build_financial_summary(s: Sizing, yr1_savings: float,
                            pv_share: float,
                            peak_thermal_mmbtu_h: float = 0.0) -> FinancialSummary
```

`pv_share` = fraction of yr1 savings attributable to PV (used to apply PV degradation); caller computes it (Task 12) as `pv_savings_component / yr1_savings`, floored at 0.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_finance.py`:

```python
import pytest

from engine.finance import (
    irr, macrs_npv, npv, project_capex, project_cashflows_capex,
    project_cashflows_eaas, simple_payback,
)
from engine.optimizer import Sizing


def test_capex_math():
    c = project_capex(Sizing(pv_kw=100.0, bess_kwh=200.0))
    assert c["gross"] == pytest.approx(100 * 1700 + 200 * 400)
    assert c["itc"] == pytest.approx(0.30 * (100 * 1700 + 200 * 400))
    assert c["net"] == pytest.approx(c["gross"] - c["itc"])


def test_macrs_npv_hand_computed():
    # 21% * 100k * sum(rate_t / 1.08^t) = 21% * 100k * 0.81129 ~= 17,037
    assert macrs_npv(100_000.0) == pytest.approx(17_037.0, abs=2.0)


def test_irr_known_solution():
    assert irr([-1000.0, 600.0, 600.0]) == pytest.approx(0.1307, abs=1e-3)


def test_npv_basic():
    assert npv([-100.0, 110.0]) == pytest.approx(110 / 1.08 - 100)


def test_simple_payback():
    assert simple_payback(100_000.0, 25_000.0) == pytest.approx(4.0)


def test_eaas_day_one_positive_and_fee_escalates():
    flows = project_cashflows_eaas(100_000.0)
    assert len(flows) == 16
    assert flows[0] == 0
    assert flows[1] == pytest.approx(15_000.0)
    assert flows[2] > flows[1]


def test_augmentation_dip_in_summary_cashflow():
    s = Sizing(bess_kwh=200.0)
    summ = build_financial_summary(s, yr1_savings=80_000.0, pv_share=0.5)
    flows = summ.capex_cashflow
    assert len(flows) == 16
    assert flows[11] < flows[10] - flows[10] * 0.05
```

Update the import line at the top of the test to include `build_financial_summary` alongside the other finance imports. Run → FAIL (module missing).

- [ ] **Step 2: Implement**

Create `backend/engine/finance.py`:

```python
from engine.models import FinancialSummary
from engine.optimizer import Sizing

HP_MMBTUH_PER_TON = 0.012

PV_USD_PER_KW = 1700.0
BESS_USD_PER_KWH = 400.0
HP_USD_PER_TON = 1800.0
ITC_RATE = 0.30
TAX_RATE = 0.21
MACRS5 = [0.20, 0.32, 0.192, 0.1152, 0.1152, 0.0576]
DISCOUNT_RATE = 0.08
UTILITY_ESCALATION = 0.025
PV_DEGRADATION = 0.005
AUGMENT_YEAR = 11
AUGMENT_FRAC = 0.40
EAAS_FEE_SHARE = 0.85
EAAS_ESCALATOR = 0.02
ANALYSIS_YEARS = 15




def project_capex(s: Sizing, peak_thermal_mmbtu_h: float = 0.0) -> dict:
    hp_tons = (s.hp_fraction * peak_thermal_mmbtu_h / HP_MMBTUH_PER_TON)
    gross = (s.pv_kw * PV_USD_PER_KW
             + s.bess_kwh * BESS_USD_PER_KWH
             + hp_tons * HP_USD_PER_TON)
    itc = ITC_RATE * (s.pv_kw * PV_USD_PER_KW + s.bess_kwh * BESS_USD_PER_KWH)
    return {"gross": gross, "itc": itc, "net": gross - itc,
            "basis": gross, "hp_tons": hp_tons}


def macrs_npv(basis: float) -> float:
    factor = sum(r / (1 + DISCOUNT_RATE) ** t for t, r in enumerate(MACRS5, start=1))
    return TAX_RATE * basis * factor


def _savings_path(yr1: float, pv_share: float) -> list[float]:
    out = []
    for y in range(ANALYSIS_YEARS):
        sav = yr1 * (1 + UTILITY_ESCALATION) ** y * (1 - PV_DEGRADATION * pv_share) ** y
        out.append(sav)
    return out


def project_cashflows_capex(net_capex: float, yr1_savings: float,
                            pv_share: float) -> list[float]:
    flows = [-net_capex] + _savings_path(yr1_savings, pv_share)
    return flows


def project_cashflows_eaas(yr1_savings: float) -> list[float]:
    flows = [0.0]
    for y in range(ANALYSIS_YEARS):
        sav = yr1_savings * (1 + UTILITY_ESCALATION) ** y
        fee = EAAS_FEE_SHARE * yr1_savings * (1 + EAAS_ESCALATOR) ** y
        flows.append(sav - fee)
    return flows


def npv(cashflows: list[float]) -> float:
    return sum(cf / (1 + DISCOUNT_RATE) ** t for t, cf in enumerate(cashflows))


def irr(cashflows: list[float]) -> float | None:
    def f(r: float) -> float:
        return sum(cf / (1 + r) ** t for t, cf in enumerate(cashflows))

    lo, hi = -0.99, 10.0
    if f(lo) * f(hi) > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        if f(lo) * f(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def simple_payback(net_capex: float, yr1_savings: float) -> float | None:
    if yr1_savings <= 0:
        return None
    return net_capex / yr1_savings


def augmentation_cost(s: Sizing) -> float:
    return AUGMENT_FRAC * s.bess_kwh * BESS_USD_PER_KWH


def build_financial_summary(s: Sizing, yr1_savings: float, pv_share: float,
                            peak_thermal_mmbtu_h: float = 0.0) -> FinancialSummary:
    capex = project_capex(s, peak_thermal_mmbtu_h)
    path = _savings_path(yr1_savings, pv_share)

    capex_flows = [-capex["net"]] + path.copy()
    capex_flows[AUGMENT_YEAR] -= augmentation_cost(s)
    macrs_benefit = macrs_npv(capex["basis"])

    eaas_flows = project_cashflows_eaas(yr1_savings)

    return FinancialSummary(
        capex_gross_usd=capex["gross"],
        incentives_usd=capex["itc"],
        capex_net_usd=capex["net"],
        annual_savings_yr1_usd=float(yr1_savings),
        npv_usd=float(npv(capex_flows) + macrs_benefit),
        irr=irr(capex_flows),
        simple_payback_years=simple_payback(capex["net"], yr1_savings),
        eaas_annual_fee_yr1_usd=EAAS_FEE_SHARE * yr1_savings,
        eaas_npv_customer_benefit_usd=float(npv(eaas_flows)),
        capex_cashflow=[float(x) for x in capex_flows],
        eaas_net_cashflow=[float(x) for x in eaas_flows],
    )
```

- [ ] **Step 3: Run tests and commit**

Run: `cd backend && python -m pytest tests/test_finance.py -v`
Expected: PASS (7 passed)

```bash
git add backend/engine/finance.py backend/tests/test_finance.py
git commit -m "feat(engine): CapEx/EaaS finance models with ITC and MACRS"
```

---

### Task 12: Sizing search (`engine/optimizer.py`, part 2)

**Files:**
- Modify: `backend/engine/errors.py` (add `InfeasibleTarget`)
- Modify: `backend/engine/optimizer.py` (append search layer)
- Test: `backend/tests/test_search.py`

**Interfaces:**
- Consumes: `dispatch_lp`, `Sizing` (Task 10); `BaselineResult`, `compute_baseline` (Task 8); `pv_power_kw` (Task 9); finance module (Task 11); `OptimizeRequest` models (Task 3).
- Produces:

```python
PV_PACKING_KW_PER_SQFT = 0.010

class InfeasibleTarget(ValueError): ...   # in engine.errors

def roof_pv_max_kw(floor_area_sqft: float) -> float

def pv_curve_per_kw(ghi_wm2: np.ndarray, temp_c: np.ndarray,
                    lat: float) -> np.ndarray   # kW output per kWp

def total_energy_cost(d: DispatchResult, tariff: Tariff) -> float
    # annual LP cost + residual gas cost (therms x rate)

@dataclass(frozen=True)
class OptimizeResult:
    baseline: BaselineResult
    best_sizing: Sizing | None    # None => do-nothing optimal / no assets enabled
    best_dispatch: DispatchResult # dispatch of best sizing (zero-sizing when None)
    best_financials: object | None  # engine.models.FinancialSummary when sizing chosen
    evaluation_log: list[dict]    # keys: pv_kw,bess_kwh,hp_fraction,total_cost_usd,
                                  #       yr1_savings_usd,co2_reduction_pct,npv_usd
    target_met: bool | None

def search_optimal(req: OptimizeRequest, repo: DataRepo | None = None) -> OptimizeResult
```

Search space (coordinate grid): `pv_frac ∈ [0, 0.5, 1.0]` of roof max × `bess_duration_h ∈ [0, 4]` × `hp_frac ∈ [0, 0.9]`. Disabled asset toggles collapse their axis to the single "absent" value. `bess_kw = 0.3 × baseline peak`. A zero-everything combo is always evaluated as the reference option (`npv = 0`).

Selection:
- `max_npv`: argmax `npv_usd`; if the winner is the zero combo or NPV ≤ 0 → `best_sizing = None`.
- `target_co2`: filter `co2_reduction_pct ≥ target`; among feasible pick max `npv_usd`; empty feasible set → raise `InfeasibleTarget`.

`pv_share` for degradation: `clip((baseline_elec+demand_spend − dispatch_annual_cost) / yr1_savings, 0, 1)`; guarded to 0 when savings ≤ 0.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_search.py`:

```python
import pytest

from engine.errors import InfeasibleTarget
from engine.models import AssetToggles, BuildingType, FacilityInput, \
    ObjectiveMode, OptimizeRequest, ScenarioConfig
from engine.optimizer import search_optimal


def _req(objective=ObjectiveMode.MAX_NPV, target=None,
         assets=AssetToggles()) -> OptimizeRequest:
    return OptimizeRequest(
        facility=FacilityInput(zip_code="94105",
                               building_type=BuildingType.OFFICE,
                               floor_area_sqft=50_000.0),
        scenario=ScenarioConfig(objective=objective,
                                co2_reduction_target_pct=target,
                                assets=assets),
    )


def test_max_npv_returns_result_with_log():
    r = search_optimal(_req())
    assert r.baseline.annual_electricity_kwh > 0
    assert len(r.evaluation_log) >= 6
    assert r.target_met is None


def test_no_assets_means_do_nothing():
    off = AssetToggles(pv=False, bess=False, heat_pump=False)
    r = search_optimal(_req(assets=off))
    assert r.best_sizing is None


def test_target_mode_meets_target():
    r = search_optimal(_req(objective=ObjectiveMode.TARGET_CO2, target=30.0))
    assert r.target_met is True
    assert r.best_sizing is not None


def test_impossible_target_raises():
    with pytest.raises(InfeasibleTarget):
        search_optimal(_req(objective=ObjectiveMode.TARGET_CO2, target=99.9))


def test_deterministic_search():
    a = search_optimal(_req())
    b = search_optimal(_req())
    assert a.evaluation_log == b.evaluation_log
    assert (a.best_sizing is None) == (b.best_sizing is None)
```

Run → FAIL (`InfeasibleTarget` missing).

- [ ] **Step 2: Implement**

Add to `backend/engine/errors.py`:

```python
class InfeasibleTarget(ValueError):
    """No evaluated asset combination achieves the requested CO2 reduction."""
```

Append to `backend/engine/optimizer.py` (new imports at top: `from dataclasses import dataclass, field` stays minimal — add `from engine import finance as fin`, `from engine.data import DataRepo, Tariff, get_repo`, `from engine.baseline import BaselineResult, compute_baseline`, `from engine.models import BaselineRequest, OptimizeRequest`, `from engine.solar import pv_power_kw`, `from engine.errors import InfeasibleTarget`):

```python
PV_PACKING_KW_PER_SQFT = 0.010


def roof_pv_max_kw(floor_area_sqft: float) -> float:
    return floor_area_sqft * PV_PACKING_KW_PER_SQFT


def pv_curve_per_kw(ghi_wm2, temp_c, lat):
    return pv_power_kw(1.0, ghi_wm2, temp_c, lat)


def total_energy_cost(d: DispatchResult, tariff: Tariff) -> float:
    return float(d.annual_cost_usd
                 + d.gas_after_mmbtu.sum() * 10.0 * tariff.gas_usd_therm)


def _combos(toggles) -> list[tuple[float, float, float]]:
    pvs = [0.0, 0.5, 1.0] if toggles.pv else [0.0]
    durs = [0.0, 4.0] if toggles.bess else [0.0]
    hps = [0.0, 0.9] if toggles.heat_pump else [0.0]
    out = []
    for pf in pvs:
        for dur in durs:
            for hf in hps:
                if pf == 0.0 and dur == 0.0 and hf == 0.0:
                    continue  # zero combo appended once at the end
                out.append((pf, dur, hf))
    out.insert(0, (0.0, 0.0, 0.0))
    return out


def search_optimal(req: OptimizeRequest, repo: DataRepo | None = None) -> OptimizeResult:
    repo = repo or get_repo()
    base = compute_baseline(
        BaselineRequest(**req.facility.model_dump()), repo)
    loc, tariff = base.location, base.tariff
    tmy = repo.tmy(loc.station_id)
    temps = tmy["temp_c"].to_numpy()
    ghi = tmy["ghi_wm2"].to_numpy()
    curve = pv_curve_per_kw(ghi, temps, repo.station_lat(loc.station_id))

    base_cost = (base.spend_electricity_usd + base.spend_demand_usd
                 + base.spend_gas_usd)
    base_co2 = base.scope1_tco2e + base.scope2_tco2e
    peak_bess_kw = 0.3 * base.peak_kw
    roof_max = roof_pv_max_kw(req.facility.floor_area_sqft)

    log: list[dict] = []
    results: list[tuple[Sizing, DispatchResult]] = []
    fins: list = []
    for pv_frac, dur, hf in _combos(req.scenario.assets):
        s = Sizing(pv_kw=pv_frac * roof_max,
                   bess_kwh=dur * peak_bess_kw,
                   bess_kw=peak_bess_kw if dur > 0 else 0.0,
                   hp_fraction=hf)
        d = dispatch_lp(base.hourly_electric_kw,
                        base.hourly_gas_mmbtu_per_hour,
                        temps, tariff,
                        curve if s.pv_kw > 0 else None, s)
        cost = total_energy_cost(d, tariff)
        yr1 = base_cost - cost
        red = (1 - d.co2_tco2e / base_co2) * 100 if base_co2 > 0 else 0.0
        pv_share = 0.0 if yr1 <= 0 else min(max(
            (base.spend_electricity_usd + base.spend_demand_usd
             - d.annual_cost_usd) / yr1, 0.0), 1.0)
        f = fin.build_financial_summary(s, yr1, pv_share,
                                        peak_thermal_mmbtu_h=float(
                                            base.hourly_gas_mmbtu_per_hour.max()))
        npv_v = f.npv_usd if yr1 > 0 else 0.0
        log.append({"pv_kw": round(s.pv_kw, 1), "bess_kwh": round(s.bess_kwh, 1),
                    "hp_fraction": hf, "total_cost_usd": round(cost, 2),
                    "yr1_savings_usd": round(yr1, 2),
                    "co2_reduction_pct": round(red, 2),
                    "npv_usd": round(npv_v, 2)})
        results.append((s, d))
        fins.append(f)

    mode = req.scenario.objective
    target_met = None
    if mode == ObjectiveMode.TARGET_CO2:
        tgt = req.scenario.co2_reduction_target_pct
        feas = [(i, row) for i, row in enumerate(log) if row["co2_reduction_pct"] >= tgt]
        if not feas:
            raise InfeasibleTarget(
                f"target {tgt}% CO2 reduction not achievable with available assets")
        best_i = max(feas, key=lambda kv: kv[1]["npv_usd"])[0]
        target_met = True
    else:
        best_npv_row = max(range(len(log)), key=lambda i: log[i]["npv_usd"])
        best_i = best_npv_row if log[best_npv_row]["npv_usd"] > 0 else 0
    s, d = results[best_i]
    none_best = all(v == 0.0 for v in (s.pv_kw, s.bess_kwh, s.hp_fraction))
    return OptimizeResult(baseline=base,
                          best_sizing=None if none_best else s,
                          best_dispatch=d,
                          best_financials=None if none_best else fins[best_i],
                          evaluation_log=log,
                          target_met=target_met)
```

Also extend the models import line with `ObjectiveMode`.

- [ ] **Step 3: Run tests and commit**

Run: `cd backend && python -m pytest tests/test_search.py tests/test_dispatch.py -v`
Expected: PASS

```bash
git add backend/engine/optimizer.py backend/engine/errors.py backend/tests/test_search.py
git commit -m "feat(engine): heuristic sizing search over dispatch evaluations"
```

---

### Task 13: Baseline & optimize endpoints with RFC 7807 errors

**Files:**
- Create: `backend/app/api/v1/baseline.py`
- Create: `backend/app/api/v1/optimize.py`
- Modify: `backend/app/main.py` (register routers + exception handlers)
- Test: `backend/tests/test_api_baseline.py`, `backend/tests/test_api_optimize.py`

**Interfaces:**
- Consumes: engine modules; models from Task 3.
- Produces:
  - `POST /api/v1/baseline` → `BaselineResponse`
  - `POST /api/v1/optimize` → `OptimizeResponse`
  - Handlers: `UnsupportedZip`, `UnsupportedBuildingType`, `InfeasibleTarget` → HTTP 422, body `{type, title, status, detail}` (`application/problem+json`).
  - Dependency: `def get_repo_dep() -> DataRepo: return get_repo()` (lives in `app/deps.py`, created here).

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_api_baseline.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app

BODY = {"zip_code": "94105", "building_type": "office", "floor_area_sqft": 50_000}


def test_baseline_contract():
    client = TestClient(create_app())
    resp = client.post("/api/v1/baseline", json=BODY)
    assert resp.status_code == 200
    data = resp.json()
    for key in ("annual_electricity_kwh", "scope1_tco2e", "spend",
                "monthly", "hourly_electric_kw"):
        assert key in data
    assert len(data["monthly"]) == 12
    assert len(data["hourly_electric_kw"]) == 8760
    assert data["climate_zone_group"] == "mixed_dry_marine"


def test_baseline_unknown_zip_problem_json():
    client = TestClient(create_app())
    resp = client.post("/api/v1/baseline",
                       json={**BODY, "zip_code": "00000"})
    assert resp.status_code == 422
    problem = resp.json()
    assert problem["status"] == 422
    assert "ZIP" in problem["detail"]
```

Create `backend/tests/test_api_optimize.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app

BODY = {
    "facility": {"zip_code": "77002", "building_type": "warehouse",
                 "floor_area_sqft": 120_000},
    "scenario": {"objective": "max_npv",
                 "assets": {"pv": True, "bess": True, "heat_pump": True}},
}


def test_optimize_contract():
    client = TestClient(create_app())
    resp = client.post("/api/v1/optimize", json=BODY)
    assert resp.status_code == 200
    data = resp.json()
    for key in ("sizing", "dispatch", "financials", "emissions_trajectory",
                "evaluation_log"):
        assert key in data
    assert len(data["emissions_trajectory"]) == 15


def test_optimize_deterministic_bytes():
    client = TestClient(create_app())
    a = client.post("/api/v1/optimize", json=BODY).content
    b = client.post("/api/v1/optimize", json=BODY).content
    assert a == b


def test_infeasible_target_problem_json():
    body = {**BODY, "scenario": {"objective": "target_co2",
                                 "co2_reduction_target_pct": 99.9}}
    resp = TestClient(create_app()).post("/api/v1/optimize", json=body)
    assert resp.status_code == 422
    assert resp.json()["title"] == "Infeasible decarbonization target"
```

Run → FAIL (404 on both POSTs).

- [ ] **Step 2: Implement**

Create `backend/app/deps.py`:

```python
from engine.data import DataRepo, get_repo


def get_repo_dep() -> DataRepo:
    return get_repo()
```

Create `backend/app/api/v1/baseline.py`:

```python
from fastapi import APIRouter, Depends

from app.deps import get_repo_dep
from engine.baseline import PROVENANCE, compute_baseline, monthly_totals
from engine.data import DataRepo
from engine.models import BaselineRequest, BaselineResponse, MonthlyPoint, SpendBreakdown

router = APIRouter()


@router.post("/baseline", response_model=BaselineResponse)
def baseline(req: BaselineRequest,
             repo: DataRepo = Depends(get_repo_dep)) -> BaselineResponse:
    r = compute_baseline(req, repo)
    loc = r.location
    return BaselineResponse(
        zip_code=req.zip_code,
        county_fips=loc.county_fips,
        county_name=loc.county_name,
        state=loc.state,
        climate_zone_group=loc.zone_group,
        tmy_station_id=loc.station_id,
        annual_electricity_kwh=r.annual_electricity_kwh,
        annual_gas_mmbtu=r.annual_gas_mmbtu,
        scope1_tco2e=r.scope1_tco2e,
        scope2_tco2e=r.scope2_tco2e,
        total_tco2e=r.scope1_tco2e + r.scope2_tco2e,
        peak_kw=r.peak_kw,
        spend=SpendBreakdown(
            electricity_usd=r.spend_electricity_usd,
            demand_charges_usd=r.spend_demand_usd,
            gas_usd=r.spend_gas_usd,
            total_usd=r.spend_electricity_usd + r.spend_demand_usd + r.spend_gas_usd,
        ),
        monthly=[
            MonthlyPoint(month=m + 1,
                         electricity_kwh=kwh,
                         gas_mmbtu=gas)
            for m, (kwh, gas) in enumerate(zip(
                monthly_totals(r.hourly_electric_kw),
                monthly_totals(r.hourly_gas_mmbtu_per_hour)))
        ],
        hourly_electric_kw=[float(x) for x in r.hourly_electric_kw],
        hourly_gas_mmbtu_per_hour=[float(x) for x in r.hourly_gas_mmbtu_per_hour],
        data_provenance=PROVENANCE,
    )
```

Create `backend/app/api/v1/optimize.py`:

```python
from fastapi import APIRouter, Depends

from app.deps import get_repo_dep
from engine.data import DataRepo
from engine.models import (
    AssetSizing, DispatchSummary, OptimizeRequest, OptimizeResponse,
    YearlyEmissions,
)
from engine.optimizer import search_optimal

router = APIRouter()

MMBTUH_PER_TON = 0.012


@router.post("/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest,
             repo: DataRepo = Depends(get_repo_dep)) -> OptimizeResponse:
    r = search_optimal(req, repo)
    base = r.baseline
    d = r.best_dispatch

    sizing = None
    if r.best_sizing is not None:
        capex_hp_tons = (r.best_sizing.hp_fraction
                         * float(base.hourly_gas_mmbtu_per_hour.max())
                         / MMBTUH_PER_TON)
        sizing = AssetSizing(
            pv_kw=r.best_sizing.pv_kw,
            bess_kwh=r.best_sizing.bess_kwh,
            bess_kw=r.best_sizing.bess_kw,
            hp_fraction=r.best_sizing.hp_fraction,
            hp_capacity_tons=capex_hp_tons,
        )

    dispatch = DispatchSummary(
        annual_import_kwh=float(d.import_kw.sum()),
        annual_export_kwh=float(d.export_kw.sum()),
        annual_gas_mmbtu_after=float(d.gas_after_mmbtu.sum()),
        unmet_hours=int((d.unmet_kw > 1e-6).sum()),
        peak_kw_after=d.peak_kw,
    )

    trajectory = []
    scope1_after = float(d.gas_after_mmbtu.sum() * 53.06 / 1000.0)
    scope2_after = float(d.import_kw.sum() / 1000.0 * base.tariff.co2e_kg_per_mwh / 1000.0)
    for year in range(1, 16):
        trajectory.append(YearlyEmissions(year=year,
                                          scope1_tco2e=round(scope1_after, 3),
                                          scope2_tco2e=round(scope2_after, 3)))

    return OptimizeResponse(
        county_name=base.location.county_name,
        state=base.location.state,
        climate_zone_group=base.location.zone_group,
        objective_mode=req.scenario.objective,
        baseline_total_cost_usd=(base.spend_electricity_usd
                                 + base.spend_demand_usd + base.spend_gas_usd),
        baseline_scope1_tco2e=base.scope1_tco2e,
        baseline_scope2_tco2e=base.scope2_tco2e,
        baseline_total_tco2e=base.scope1_tco2e + base.scope2_tco2e,
        sizing=sizing,
        dispatch=dispatch,
        financials=r.best_financials,
        emissions_trajectory=trajectory,
        target_met=r.target_met,
        evaluation_log=r.evaluation_log,
    )
```

Modify `backend/app/main.py` — add imports and inside `create_app()` after middleware:

```python
from fastapi.responses import JSONResponse

from app.api.v1.baseline import router as baseline_router
from app.api.v1.optimize import router as optimize_router
from engine.errors import InfeasibleTarget, UnsupportedBuildingType, UnsupportedZip


def _problem(status: int, title: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status,
                        media_type="application/problem+json",
                        content={"type": "about:blank", "title": title,
                                 "status": status, "detail": detail})
```

and register inside `create_app()`:

```python
    @app.exception_handler(UnsupportedZip)
    async def _zip_handler(_req, exc: UnsupportedZip):
        return _problem(422, "Unsupported ZIP code", str(exc))

    @app.exception_handler(UnsupportedBuildingType)
    async def _type_handler(_req, exc: UnsupportedBuildingType):
        return _problem(422, "Unsupported building type", str(exc))

    @app.exception_handler(InfeasibleTarget)
    async def _target_handler(_req, exc: InfeasibleTarget):
        return _problem(422, "Infeasible decarbonization target", str(exc))

    app.include_router(baseline_router, prefix="/api/v1")
    app.include_router(optimize_router, prefix="/api/v1")
```

- [ ] **Step 3: Run all backend tests**

Run: `cd backend && python -m pytest -v`
Expected: PASS (all suites)

- [ ] **Step 4: Commit**

```bash
git add backend
git commit -m "feat(api): baseline and optimize endpoints with RFC7807 errors"
```

---

### Task 14: Resilience engine + endpoint

**Files:**
- Create: `backend/engine/resilience.py`
- Create: `backend/app/api/v1/resilience.py`
- Modify: `backend/app/main.py` (register router)
- Test: `backend/tests/test_resilience.py`

**Interfaces:**
- Consumes: `DataRepo.hazard()` (Task 6), `AssetToggles`/`ResilienceRequest`/`ResilienceResponse`/`HazardScore` (Tasks 3).
- Produces:

```python
SENSITIVITY: dict[str, dict[str, float]]   # building_type -> hazard -> weight
MITIGATIONS: list[dict]                    # catalog entries (below)

def assess(zip_code: str, building_type: str, portfolio, repo) -> ResilienceResult
    # portfolio: engine.models.AssetToggles

@dataclass(frozen=True)
class ResilienceResult:
    county_fips: str; county_name: str; state: str
    hazards: list[dict]     # {"hazard","before","after","mitigations":[labels]}
    overall_before: float   # sensitivity-weighted mean of raw scores
    overall_after: float
```

Sensitivity weights (embed exactly):

```python
SENSITIVITY = {
    "office":            {"extreme_heat": 1.0, "cold": 0.9, "flood": 0.9, "hurricane": 0.9, "wildfire": 0.8},
    "retail_standalone": {"extreme_heat": 1.0, "cold": 0.9, "flood": 1.0, "hurricane": 0.9, "wildfire": 0.8},
    "warehouse":         {"extreme_heat": 0.8, "cold": 0.7, "flood": 1.0, "hurricane": 0.9, "wildfire": 0.8},
    "k12_school":        {"extreme_heat": 1.0, "cold": 1.0, "flood": 0.9, "hurricane": 0.9, "wildfire": 0.8},
    "hospital":          {"extreme_heat": 1.3, "cold": 1.2, "flood": 1.2, "hurricane": 1.2, "wildfire": 1.0},
    "hotel":             {"extreme_heat": 1.0, "cold": 1.0, "flood": 0.9, "hurricane": 1.0, "wildfire": 0.9},
}
```

Mitigation catalog (embed exactly; `asset=None` measures apply whenever any asset is selected):

```python
MITIGATIONS = [
    {"id": "bess_islanding", "label": "Battery backup power",
     "hazards": ["hurricane", "wildfire", "flood"], "asset": "bess", "reduction": 0.40},
    {"id": "hp_cooling", "label": "High-efficiency heat pump cooling",
     "hazards": ["extreme_heat"], "asset": "heat_pump", "reduction": 0.35},
    {"id": "cc_hp", "label": "Cold-climate heat pump",
     "hazards": ["cold"], "asset": "heat_pump", "reduction": 0.30},
    {"id": "envelope", "label": "Envelope hardening and shading",
     "hazards": ["extreme_heat", "hurricane"], "asset": None, "reduction": 0.10},
]
```

Scoring: `after_h = before_h × Π(1 − reduction)` over matched mitigations; `overall = Σ(weight×score)/Σ(weight)` over the five hazards; scores clamped to [0, 100].

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_resilience.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app
from engine.models import AssetToggles
from engine.resilience import assess


def test_hospital_more_exposed_than_office_same_county():
    hosp = assess("77002", "hospital", AssetToggles(pv=False, bess=False,
                                                    heat_pump=False))
    off = assess("77002", "office", AssetToggles(pv=False, bess=False,
                                                 heat_pump=False))
    assert hosp.overall_before > off.overall_before


def test_bess_reduces_storm_risk_not_heat():
    base = assess("85004", "warehouse", AssetToggles(pv=False, bess=False,
                                                     heat_pump=False))
    with_bess = assess("85004", "warehouse", AssetToggles(pv=False, bess=True,
                                                          heat_pump=False))
    by = {h["hazard"]: h for h in with_bess.hazards}
    bf = {h["hazard"]: h for h in base.hazards}
    assert by["hurricane"]["after"] < bf["hurricane"]["after"]
    assert by["extreme_heat"]["after"] == bf["extreme_heat"]["after"]


def test_endpoint_contract():
    resp = TestClient(create_app()).post("/api/v1/resilience", json={
        "zip_code": "60601", "building_type": "k12_school",
        "portfolio": {"pv": True, "bess": True, "heat_pump": True}})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["hazards"]) == 5
    assert data["overall_after"] <= data["overall_before"]
```

Run → FAIL (module missing / 404).

- [ ] **Step 2: Implement**

Create `backend/engine/resilience.py`:

```python
from dataclasses import dataclass

from engine.data import DataRepo, get_repo
from engine.models import AssetToggles

HAZARDS = ("extreme_heat", "cold", "flood", "hurricane", "wildfire")

SENSITIVITY = {
    "office":            {"extreme_heat": 1.0, "cold": 0.9, "flood": 0.9, "hurricane": 0.9, "wildfire": 0.8},
    "retail_standalone": {"extreme_heat": 1.0, "cold": 0.9, "flood": 1.0, "hurricane": 0.9, "wildfire": 0.8},
    "warehouse":         {"extreme_heat": 0.8, "cold": 0.7, "flood": 1.0, "hurricane": 0.9, "wildfire": 0.8},
    "k12_school":        {"extreme_heat": 1.0, "cold": 1.0, "flood": 0.9, "hurricane": 0.9, "wildfire": 0.8},
    "hospital":          {"extreme_heat": 1.3, "cold": 1.2, "flood": 1.2, "hurricane": 1.2, "wildfire": 1.0},
    "hotel":             {"extreme_heat": 1.0, "cold": 1.0, "flood": 0.9, "hurricane": 1.0, "wildfire": 0.9},
}
MITIGATIONS = [
    {"id": "bess_islanding", "label": "Battery backup power",
     "hazards": ["hurricane", "wildfire", "flood"], "asset": "bess", "reduction": 0.40},
    {"id": "hp_cooling", "label": "High-efficiency heat pump cooling",
     "hazards": ["extreme_heat"], "asset": "heat_pump", "reduction": 0.35},
    {"id": "cc_hp", "label": "Cold-climate heat pump",
     "hazards": ["cold"], "asset": "heat_pump", "reduction": 0.30},
    {"id": "envelope", "label": "Envelope hardening and shading",
     "hazards": ["extreme_heat", "hurricane"], "asset": None, "reduction": 0.10},
]


@dataclass(frozen=True)
class ResilienceResult:
    county_fips: str
    county_name: str
    state: str
    hazards: list[dict]
    overall_before: float
    overall_after: float


def _matched(h: str, portfolio: AssetToggles) -> list[dict]:
    any_asset = portfolio.pv or portfolio.bess or portfolio.heat_pump
    out = []
    for m in MITIGATIONS:
        if h not in m["hazards"]:
            continue
        if m["asset"] is None:
            if any_asset:
                out.append(m)
        elif getattr(portfolio, m["asset"]):
            out.append(m)
    return out


def assess(zip_code: str, building_type: str, portfolio: AssetToggles,
           repo: DataRepo | None = None) -> ResilienceResult:
    repo = repo or get_repo()
    loc = repo.location(zip_code)
    raw = repo.hazard(loc.county_fips)
    weights = SENSITIVITY[building_type]

    rows, wsum, bsum, asum = [], 0.0, 0.0, 0.0
    for h in HAZARDS:
        before = min(100.0, raw[h] * weights[h])
        factor = 1.0
        labels = []
        for m in _matched(h, portfolio):
            factor *= (1.0 - m["reduction"])
            labels.append(m["label"])
        after = max(0.0, min(100.0, before * factor))
        rows.append({"hazard": h, "before": round(before, 1),
                     "after": round(after, 1), "mitigations": labels})
        wsum += weights[h]
        bsum += before
        asum += after

    return ResilienceResult(
        county_fips=loc.county_fips, county_name=loc.county_name,
        state=loc.state, hazards=rows,
        overall_before=round(bsum / wsum, 1),
        overall_after=round(asum / wsum, 1),
    )
```

Create `backend/app/api/v1/resilience.py`:

```python
from fastapi import APIRouter, Depends

from app.deps import get_repo_dep
from engine.data import DataRepo
from engine.models import HazardScore, ResilienceRequest, ResilienceResponse
from engine.resilience import assess

router = APIRouter()


@router.post("/resilience", response_model=ResilienceResponse)
def resilience(req: ResilienceRequest,
               repo: DataRepo = Depends(get_repo_dep)) -> ResilienceResponse:
    r = assess(req.zip_code, req.building_type.value, req.portfolio, repo)
    return ResilienceResponse(
        county_fips=r.county_fips,
        county_name=r.county_name,
        state=r.state,
        overall_before=r.overall_before,
        overall_after=r.overall_after,
        hazards=[HazardScore(**row) for row in r.hazards],
    )
```

In `backend/app/main.py`, add:

```python
from app.api.v1.resilience import router as resilience_router
...
    app.include_router(resilience_router, prefix="/api/v1")
```

- [ ] **Step 3: Run tests and commit**

Run: `cd backend && python -m pytest tests/test_resilience.py -v`
Expected: PASS (3 passed)

```bash
git add backend/engine/resilience.py backend/app/api/v1/resilience.py \
        backend/app/main.py backend/tests/test_resilience.py
git commit -m "feat(resilience): NRI-based hazard scoring with mitigation matching"
```

---

### Task 15: Reference endpoints, smoke script, README

**Files:**
- Create: `backend/app/api/v1/reference.py`
- Create: `scripts/smoke_demo.sh`
- Create: `README.md` (repo root)
- Modify: `backend/app/main.py` (register reference router)
- Test: `backend/tests/test_reference.py`

**Interfaces:**
- Produces:
  - `GET /api/v1/reference/building-types` → `[{"value","label"}, ...]` (six types)
  - `GET /api/v1/reference/demo-zips` → `[{"zip","label"}, ...]` (the eight demo ZIPs with county labels)
  - `GET /api/v1/reference/assumptions` → finance/emissions constants dict

Labels (exact):

```python
LABELS = {
    "office": "Office",
    "retail_standalone": "Retail (standalone)",
    "warehouse": "Warehouse",
    "k12_school": "K-12 school",
    "hospital": "Hospital",
    "hotel": "Hotel",
}
DEMO_ZIP_LABELS = {
    "94105": "San Francisco, CA", "10001": "New York, NY",
    "60601": "Chicago, IL", "77002": "Houston, TX", "85004": "Phoenix, AZ",
    "30303": "Atlanta, GA", "80202": "Denver, CO", "98104": "Seattle, WA",
}
```

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_reference.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_building_types_six_entries():
    data = TestClient(create_app()).get("/api/v1/reference/building-types").json()
    assert len(data) == 6
    assert {"value": "office", "label": "Office"} in data


def test_demo_zips_eight_entries():
    data = TestClient(create_app()).get("/api/v1/reference/demo-zips").json()
    assert len(data) == 8
    assert any(d["zip"] == "94105" for d in data)


def test_assumptions_exposes_constants():
    a = TestClient(create_app()).get("/api/v1/reference/assumptions").json()
    assert a["pv_usd_per_kw"] == 1700.0
    assert a["gas_kgco2e_per_mmbtu"] == 53.06
```

Run → FAIL (404).

- [ ] **Step 2: Implement router**

Create `backend/app/api/v1/reference.py`:

```python
from fastapi import APIRouter

from engine.baseline import GAS_KGCO2E_PER_MMBTU, PROVENANCE
from engine.data import get_repo
from engine.finance import (
    ANALYSIS_YEARS, BESS_USD_PER_KWH, DISCOUNT_RATE, EAAS_FEE_SHARE,
    HP_USD_PER_TON, ITC_RATE, PV_USD_PER_KW, UTILITY_ESCALATION,
)

router = APIRouter()

LABELS = {
    "office": "Office",
    "retail_standalone": "Retail (standalone)",
    "warehouse": "Warehouse",
    "k12_school": "K-12 school",
    "hospital": "Hospital",
    "hotel": "Hotel",
}
DEMO_ZIP_LABELS = {
    "94105": "San Francisco, CA", "10001": "New York, NY",
    "60601": "Chicago, IL", "77002": "Houston, TX", "85004": "Phoenix, AZ",
    "30303": "Atlanta, GA", "80202": "Denver, CO", "98104": "Seattle, WA",
}


@router.get("/reference/building-types")
def building_types() -> list[dict]:
    available = set(get_repo().building_types())
    return [{"value": k, "label": v} for k, v in LABELS.items()
            if k in available]


@router.get("/reference/demo-zips")
def demo_zips() -> list[dict]:
    return [{"zip": z, "label": label} for z, label in DEMO_ZIP_LABELS.items()]


@router.get("/reference/assumptions")
def assumptions() -> dict:
    return {
        "pv_usd_per_kw": PV_USD_PER_KW,
        "bess_usd_per_kwh": BESS_USD_PER_KWH,
        "hp_usd_per_ton": HP_USD_PER_TON,
        "itc_rate": ITC_RATE,
        "discount_rate": DISCOUNT_RATE,
        "utility_escalation": UTILITY_ESCALATION,
        "eaas_fee_share": EAAS_FEE_SHARE,
        "analysis_years": ANALYSIS_YEARS,
        "gas_kgco2e_per_mmbtu": GAS_KGCO2E_PER_MMBTU,
        "provenance": PROVENANCE,
    }
```

Register in `main.py`:

```python
from app.api.v1.reference import router as reference_router
...
    app.include_router(reference_router, prefix="/api/v1")
```

- [ ] **Step 3: Smoke script**

Create `scripts/smoke_demo.sh`:

```bash
#!/usr/bin/env bash
# Hits every endpoint for each demo ZIP; exits non-zero on any failure.
set -euo pipefail
BASE="${1:-http://localhost:8000}"
ZIPS=(94105 10001 60601 77002 85004 30303 80202 98104)

curl -sf "$BASE/api/v1/health" > /dev/null
for zip in "${ZIPS[@]}"; do
  curl -sf -X POST "$BASE/api/v1/baseline" -H 'Content-Type: application/json' \
       -d "{\"zip_code\":\"$zip\",\"building_type\":\"office\",\"floor_area_sqft\":50000}" > /dev/null
  curl -sf -X POST "$BASE/api/v1/optimize" -H 'Content-Type: application/json' \
       -d "{\"facility\":{\"zip_code\":\"$zip\",\"building_type\":\"warehouse\",\"floor_area_sqft\":120000},\"scenario\":{\"objective\":\"max_npv\"}}" > /dev/null
  curl -sf -X POST "$BASE/api/v1/resilience" -H 'Content-Type: application/json' \
       -d "{\"zip_code\":\"$zip\",\"building_type\":\"hospital\"}" > /dev/null
  echo "OK $zip"
done
echo "smoke passed"
```

Make executable: `chmod +x scripts/smoke_demo.sh`

- [ ] **Step 4: README**

Create `README.md` at repo root:

```markdown
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
```

- [ ] **Step 5: Full suite + manual smoke**

Run: `cd backend && python -m pytest -v`
Expected: PASS (all).

In a second terminal: `cd backend && uvicorn app.main:create_app --factory --port 8000`, then `./scripts/smoke_demo.sh`.
Expected: eight `OK <zip>` lines + `smoke passed`. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add backend README.md scripts/smoke_demo.sh
git commit -m "feat(api): reference endpoints, demo smoke script, README"
```

---

## Plan complete

Frontend wizard (Next.js) is covered by a separate plan: `docs/superpowers/plans/2026-08-26-frontend-wizard.md`.
