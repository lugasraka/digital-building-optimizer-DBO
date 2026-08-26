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
