from dataclasses import dataclass

from engine.data import DataRepo, get_repo
from engine.models import AssetToggles

HAZARDS = ("extreme_heat", "cold", "flood", "hurricane", "wildfire")

SENSITIVITY = {
    "office":            {"extreme_heat": 1.0, "cold": 0.9, "flood": 0.9, "hurricane": 0.9, "wildfire": 0.8},
    "retail_standalone": {"extreme_heat": 1.0, "cold": 0.9, "flood": 1.0, "hurricane": 0.9, "wildfire": 0.8},
    "warehouse":         {"extreme_heat": 0.8, "cold": 0.7, "flood": 1.0, "hurricane": 0.9, "wildfire": 0.8},
    "k12_school":        {"extreme_heat": 1.0, "cold": 1.0, "flood": 0.9, "hurricane": 0.9, "wildfire": 0.8},
    "hospital":          {"extreme_heat": 1.3, "cold": 1.2, "flood": 1.2, "hurricane": 1.2, "wildfire": 1.0},
    "hotel":             {"extreme_heat": 1.0, "cold": 1.0, "flood": 0.9, "hurricane": 1.0, "wildfire": 0.9},
}
MITIGATIONS = [
    {"id": "bess_islanding", "label": "Battery backup power",
     "hazards": ["hurricane", "wildfire", "flood"], "asset": "bess", "reduction": 0.40},
    {"id": "hp_cooling", "label": "High-efficiency heat pump cooling",
     "hazards": ["extreme_heat"], "asset": "heat_pump", "reduction": 0.35},
    {"id": "cc_hp", "label": "Cold-climate heat pump",
     "hazards": ["cold"], "asset": "heat_pump", "reduction": 0.30},
    {"id": "envelope", "label": "Envelope hardening and shading",
     "hazards": ["extreme_heat", "hurricane"], "asset": None, "reduction": 0.10},
]


@dataclass(frozen=True)
class ResilienceResult:
    county_fips: str
    county_name: str
    state: str
    hazards: list[dict]
    overall_before: float
    overall_after: float


def _matched(h: str, portfolio: AssetToggles) -> list[dict]:
    any_asset = portfolio.pv or portfolio.bess or portfolio.heat_pump
    out = []
    for m in MITIGATIONS:
        if h not in m["hazards"]:
            continue
        if m["asset"] is None:
            if any_asset:
                out.append(m)
        elif getattr(portfolio, m["asset"]):
            out.append(m)
    return out


def assess(zip_code: str, building_type: str, portfolio: AssetToggles,
           repo: DataRepo | None = None) -> ResilienceResult:
    repo = repo or get_repo()
    loc = repo.location(zip_code)
    raw = repo.hazard(loc.county_fips)
    weights = SENSITIVITY[building_type]

    rows, wsum, bsum, asum = [], 0.0, 0.0, 0.0
    for h in HAZARDS:
        before = min(100.0, raw[h] * weights[h])
        factor = 1.0
        labels = []
        for m in _matched(h, portfolio):
            factor *= (1.0 - m["reduction"])
            labels.append(m["label"])
        after = max(0.0, min(100.0, before * factor))
        rows.append({"hazard": h, "before": round(before, 1),
                     "after": round(after, 1), "mitigations": labels})
        wsum += weights[h]
        bsum += before
        asum += after

    return ResilienceResult(
        county_fips=loc.county_fips, county_name=loc.county_name,
        state=loc.state, hazards=rows,
        overall_before=round(bsum / wsum, 1),
        overall_after=round(asum / wsum, 1),
    )