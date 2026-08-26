from fastapi.testclient import TestClient

from app.main import create_app
from engine.models import AssetToggles
from engine.resilience import assess


def test_hospital_more_exposed_than_office_same_county():
    hosp = assess("60601", "hospital", AssetToggles(pv=False, bess=False,
                                                    heat_pump=False))
    off = assess("60601", "office", AssetToggles(pv=False, bess=False,
                                                 heat_pump=False))
    assert hosp.overall_before > off.overall_before


def test_bess_reduces_storm_risk_not_heat():
    base = assess("85004", "warehouse", AssetToggles(pv=True, bess=False,
                                                     heat_pump=False))
    with_bess = assess("85004", "warehouse", AssetToggles(pv=True, bess=True,
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