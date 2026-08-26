import json
from pathlib import Path

import pytest

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
