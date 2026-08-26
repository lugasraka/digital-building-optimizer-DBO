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
