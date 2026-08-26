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
