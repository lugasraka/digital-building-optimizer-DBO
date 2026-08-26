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