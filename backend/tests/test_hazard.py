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
