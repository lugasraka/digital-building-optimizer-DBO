import pytest
from pydantic import ValidationError

from engine.models import BuildingType, FacilityInput


def test_facility_input_accepts_valid():
    f = FacilityInput(zip_code="94105", building_type=BuildingType.OFFICE, floor_area_sqft=50_000)
    assert f.vintage is None


def test_zip_pattern_enforced():
    with pytest.raises(ValidationError):
        FacilityInput(zip_code="9410", building_type=BuildingType.OFFICE, floor_area_sqft=50_000)


def test_floor_area_bounds():
    with pytest.raises(ValidationError):
        FacilityInput(zip_code="94105", building_type=BuildingType.OFFICE, floor_area_sqft=100)
