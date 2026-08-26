from fastapi import APIRouter

from engine.baseline import GAS_KGCO2E_PER_MMBTU, PROVENANCE
from engine.data import get_repo
from engine.finance import (
    ANALYSIS_YEARS, BESS_USD_PER_KWH, DISCOUNT_RATE, EAAS_FEE_SHARE,
    HP_USD_PER_TON, ITC_RATE, PV_USD_PER_KW, UTILITY_ESCALATION,
)

router = APIRouter()

LABELS = {
    "office": "Office",
    "retail_standalone": "Retail (standalone)",
    "warehouse": "Warehouse",
    "k12_school": "K-12 school",
    "hospital": "Hospital",
    "hotel": "Hotel",
}
DEMO_ZIP_LABELS = {
    "94105": "San Francisco, CA", "10001": "New York, NY",
    "60601": "Chicago, IL", "77002": "Houston, TX", "85004": "Phoenix, AZ",
    "30303": "Atlanta, GA", "80202": "Denver, CO", "98104": "Seattle, WA",
}


@router.get("/reference/building-types")
def building_types() -> list[dict]:
    available = set(get_repo().building_types())
    return [{"value": k, "label": v} for k, v in LABELS.items()
            if k in available]


@router.get("/reference/demo-zips")
def demo_zips() -> list[dict]:
    return [{"zip": z, "label": label} for z, label in DEMO_ZIP_LABELS.items()]


@router.get("/reference/assumptions")
def assumptions() -> dict:
    return {
        "pv_usd_per_kw": PV_USD_PER_KW,
        "bess_usd_per_kwh": BESS_USD_PER_KWH,
        "hp_usd_per_ton": HP_USD_PER_TON,
        "itc_rate": ITC_RATE,
        "discount_rate": DISCOUNT_RATE,
        "utility_escalation": UTILITY_ESCALATION,
        "eaas_fee_share": EAAS_FEE_SHARE,
        "analysis_years": ANALYSIS_YEARS,
        "gas_kgco2e_per_mmbtu": GAS_KGCO2E_PER_MMBTU,
        "provenance": PROVENANCE,
    }
