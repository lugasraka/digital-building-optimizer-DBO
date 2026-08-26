class UnsupportedZip(ValueError):
    """ZIP code not present in the bundled crosswalk."""


class UnsupportedBuildingType(ValueError):
    """Building type not present in the bundled benchmarks."""


class InfeasibleTarget(ValueError):
    """No evaluated asset combination achieves the requested CO2 reduction."""
