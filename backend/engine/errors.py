class UnsupportedZip(ValueError):
    """ZIP code not present in the bundled crosswalk."""


class UnsupportedBuildingType(ValueError):
    """Building type not present in the bundled benchmarks."""
