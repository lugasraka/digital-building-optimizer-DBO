import pytest

from engine.data import DataRepo
from engine.errors import UnsupportedBuildingType, UnsupportedZip


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
