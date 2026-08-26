"""Builds the county hazard index into backend/data/hazard_index.parquet.

Prefers FEMA NRI national counties CSV. Falls back to an embedded
state-level table when offline or schema-changed (printed honestly).
Run from repo root: python data_pipeline/build_nri.py
"""
import io
import json
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "backend" / "data"
NRI_URL = ("https://hazards.fema.gov/nri/Content/StaticDocuments/DataDownload/"
           "NRI_Data_Counties/NRI_Counties_Csv.zip")
HAZARDS = ["extreme_heat", "cold", "flood", "hurricane", "wildfire"]

# Column names as published by FEMA NRI (v2022+); verified at runtime.
NRI_COLUMNS = {
    "extreme_heat": "HEAT_SCORE",
    "cold": "CWAV_SCORE",
    "flood": "CFLD_SCORE",
    "hurricane": "HRCN_SCORE",
    "wildfire": "WFIR_SCORE",
}

STATE_FIPS = {
    "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE",
    "11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA",
    "20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN",
    "28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM",
    "36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
    "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA",
    "54":"WV","55":"WI","56":"WY",
}

# Embedded fallback: state USPS -> {hazard: 0-100}. Relative exposure,
# curated approximations of NRI statewide patterns.
FALLBACK = {
    "AL":{"extreme_heat":78,"cold":25,"flood":55,"hurricane":82,"wildfire":40},
    "AK":{"extreme_heat":5,"cold":80,"flood":30,"hurricane":5,"wildfire":45},
    "AZ":{"extreme_heat":88,"cold":20,"flood":30,"hurricane":10,"wildfire":85},
    "AR":{"extreme_heat":65,"cold":40,"flood":50,"hurricane":45,"wildfire":55},
    "CA":{"extreme_heat":70,"cold":15,"flood":45,"hurricane":25,"wildfire":92},
    "CO":{"extreme_heat":45,"cold":55,"flood":35,"hurricane":8,"wildfire":80},
    "CT":{"extreme_heat":35,"cold":60,"flood":45,"hurricane":45,"wildfire":20},
    "DE":{"extreme_heat":45,"cold":55,"flood":50,"hurricane":55,"wildfire":25},
    "DC":{"extreme_heat":50,"cold":52,"flood":48,"hurricane":48,"wildfire":10},
    "FL":{"extreme_heat":95,"cold":8,"flood":70,"hurricane":95,"wildfire":55},
    "GA":{"extreme_heat":80,"cold":22,"flood":58,"hurricane":75,"wildfire":60},
    "HI":{"extreme_heat":40,"cold":2,"flood":35,"hurricane":70,"wildfire":60},
    "ID":{"extreme_heat":35,"cold":60,"flood":40,"hurricane":5,"wildfire":78},
    "IL":{"extreme_heat":48,"cold":68,"flood":52,"hurricane":18,"wildfire":35},
    "IN":{"extreme_heat":45,"cold":66,"flood":50,"hurricane":18,"wildfire":32},
    "IA":{"extreme_heat":40,"cold":70,"flood":55,"hurricane":20,"wildfire":30},
    "KS":{"extreme_heat":55,"cold":62,"flood":48,"hurricane":25,"wildfire":45},
    "KY":{"extreme_heat":50,"cold":58,"flood":52,"hurricane":28,"wildfire":42},
    "LA":{"extreme_heat":82,"cold":15,"flood":85,"hurricane":90,"wildfire":45},
    "ME":{"extreme_heat":25,"cold":72,"flood":35,"hurricane":30,"wildfire":15},
    "MD":{"extreme_heat":52,"cold":52,"flood":52,"hurricane":50,"wildfire":28},
    "MA":{"extreme_heat":38,"cold":62,"flood":42,"hurricane":48,"wildfire":18},
    "MI":{"extreme_heat":35,"cold":72,"flood":45,"hurricane":15,"wildfire":25},
    "MN":{"extreme_heat":30,"cold":80,"flood":48,"hurricane":12,"wildfire":28},
    "MS":{"extreme_heat":78,"cold":18,"flood":62,"hurricane":85,"wildfire":50},
    "MO":{"extreme_heat":58,"cold":58,"flood":55,"hurricane":32,"wildfire":40},
    "MT":{"extreme_heat":28,"cold":68,"flood":35,"hurricane":5,"wildfire":70},
    "NE":{"extreme_heat":48,"cold":72,"flood":50,"hurricane":15,"wildfire":32},
    "NV":{"extreme_heat":85,"cold":25,"flood":22,"hurricane":5,"wildfire":75},
    "NH":{"extreme_heat":22,"cold":70,"flood":35,"hurricane":28,"wildfire":12},
    "NJ":{"extreme_heat":50,"cold":55,"flood":55,"hurricane":55,"wildfire":22},
    "NM":{"extreme_heat":60,"cold":35,"flood":28,"hurricane":5,"wildfire":82},
    "NY":{"extreme_heat":42,"cold":65,"flood":48,"hurricane":35,"wildfire":22},
    "NC":{"extreme_heat":68,"cold":38,"flood":60,"hurricane":72,"wildfire":62},
    "ND":{"extreme_heat":30,"cold":82,"flood":45,"hurricane":8,"wildfire":25},
    "OH":{"extreme_heat":45,"cold":64,"flood":50,"hurricane":15,"wildfire":28},
    "OK":{"extreme_heat":75,"cold":55,"flood":45,"hurricane":45,"wildfire":55},
    "OR":{"extreme_heat":42,"cold":40,"flood":42,"hurricane":8,"wildfire":75},
    "PA":{"extreme_heat":42,"cold":66,"flood":48,"hurricane":22,"wildfire":25},
    "RI":{"extreme_heat":36,"cold":60,"flood":42,"hurricane":46,"wildfire":15},
    "SC":{"extreme_heat":78,"cold":20,"flood":60,"hurricane":82,"wildfire":55},
    "SD":{"extreme_heat":35,"cold":78,"flood":45,"hurricane":8,"wildfire":22},
    "TN":{"extreme_heat":65,"cold":45,"flood":52,"hurricane":30,"wildfire":45},
    "TX":{"extreme_heat":85,"cold":30,"flood":62,"hurricane":70,"wildfire":78},
    "UT":{"extreme_heat":55,"cold":45,"flood":25,"hurricane":4,"wildfire":65},
    "VT":{"extreme_heat":20,"cold":74,"flood":38,"hurricane":15,"wildfire":10},
    "VA":{"extreme_heat":62,"cold":42,"flood":55,"hurricane":55,"wildfire":50},
    "WA":{"extreme_heat":35,"cold":35,"flood":40,"hurricane":10,"wildfire":60},
    "WV":{"extreme_heat":40,"cold":50,"flood":48,"hurricane":12,"wildfire":48},
    "WI":{"extreme_heat":32,"cold":76,"flood":45,"hurricane":10,"wildfire":22},
    "WY":{"extreme_heat":30,"cold":65,"flood":25,"hurricane":3,"wildfire":45},
}


def try_nri() -> pd.DataFrame | None:
    try:
        raw = urllib.request.urlopen(NRI_URL, timeout=180).read()
        zf = zipfile.ZipFile(io.BytesIO(raw))
        name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
        df = pd.read_csv(zf.open(name), low_memory=False)
        need = list(NRI_COLUMNS.values()) + ["STCOFIPS"]
        if not all(c in df.columns for c in need):
            print(f"NRI schema mismatch: missing {[c for c in need if c not in df.columns]}")
            return None
        out = df[["STCOFIPS"] + list(NRI_COLUMNS.values())].copy()
        out.columns = ["county_fips"] + HAZARDS
        out["county_fips"] = out["county_fips"].astype(str).str.zfill(5)
        return out.dropna()
    except Exception as exc:  # network, zip, schema — any failure falls back
        print(f"NRI download unavailable ({exc}); using embedded state fallback")
        return None


def fallback_frame() -> pd.DataFrame:
    rows = []
    for stcofips, usps in STATE_FIPS.items():
        vals = FALLBACK[usps]
        rows.append({"county_fips": stcofips + "000", **vals})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    frame = try_nri()
    source = "FEMA NRI counties"
    if frame is None:
        frame = fallback_frame()
        source = "embedded state-level fallback"
    DATA.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(DATA / "hazard_index.parquet", index=False)
    (DATA / "hazard_source.json").write_text(json.dumps({"source": source}))
    print(f"wrote {len(frame)} counties from {source}")
