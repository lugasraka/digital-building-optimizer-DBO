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