import pytest
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


def test_optimize_response_includes_hourly_dispatch():
    r = TestClient(create_app()).post("/api/v1/optimize", json=BODY).json()
    assert len(r["hourly_import_kw"]) == 8760
    assert len(r["hourly_export_kw"]) == 8760
    assert len(r["hourly_bess_soc_kwh"]) == 8760
    assert sum(r["hourly_export_kw"]) == pytest.approx(r["dispatch"]["annual_export_kwh"])
    assert sum(r["hourly_import_kw"]) == pytest.approx(r["dispatch"]["annual_import_kwh"])


def test_do_nothing_optimal_hourly_series():
    # all asset toggles off -> only the zero sizing combo, so sizing is None
    body = {**BODY, "scenario": {"objective": "max_npv",
                                 "assets": {"pv": False, "bess": False, "heat_pump": False}}}
    r = TestClient(create_app()).post("/api/v1/optimize", json=body).json()
    assert r["sizing"] is None
    assert set(r["hourly_export_kw"]) == {0.0}
    assert set(r["hourly_bess_soc_kwh"]) == {0.0}
    assert sum(r["hourly_import_kw"]) == pytest.approx(r["dispatch"]["annual_import_kwh"])