"""Builds full ZIP3 -> county crosswalk into backend/data/climate_zones.json.

Downloads the US Census 2020 ZCTA-to-county relationship file once (network
required). Deterministic output. Run from repo root:
    python data_pipeline/build_crosswalk.py
"""
import csv
import io
import json
import urllib.request
import urllib.error
import zipfile
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "backend" / "data"
ZONES_FILE = DATA / "climate_zones.json"

# Census 2020 ZCTA20 <-> county20 national relationship file (pipe-delimited)
# Primary URL is the zipped variant; fallback to plain .txt if zip not available
# (same dataset, same provenance, Census moved to unzipped hosting).
SOURCE_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/"
    "tab20_zcta520_county20_natl.txt.zip"
)

ZONE_RULES = [
    ("hot_humid",        {"FL","LA","MS","AL","GA","SC","AR","TN","NC","VA","KY","TX"}),
    ("hot_dry",          {"AZ","NV","NM","OK","KS"}),
    ("mixed_dry_marine", {"CA","WA","OR"}),
    ("very_cold_cold",   {"MN","ND","SD","MT","WI","ME","ID","WY","NH","VT","IA","NE",
                          "IL","IN","OH","PA","NY","NJ","CT","RI","MA","CO","UT","AK"}),
]

STATE_STATION = {  # station per state; demo fallback entries agree with this table
    "CA":"KSFO","NY":"KNYC","IL":"KCHI","TX":"KHOU","AZ":"KPHX","GA":"KATL",
    "CO":"KDEN","WA":"KSEA","MA":"KBOS","FL":"KMIA","PA":"KPHL","MN":"KMSP",
    "UT":"KSLC","NV":"KLAS","OR":"KPDX","MI":"KDTW","NJ":"KPHL","OH":"KCLE",
    "IN":"KIND","WI":"KMKE","MO":"KMEM","TN":"KBNA","NC":"KCLT","MD":"KPHL",
    "VA":"KCLT","KY":"KBNA","OK":"KOKC","KS":"KOKC","NM":"KPHX","SC":"KATL",
    "LA":"KHOU","AL":"KATL","MS":"KMEM","AR":"KMEM","IA":"KMSP","NE":"KMSP",
    "ND":"KMSP","SD":"KMSP","MT":"KMSP","ME":"KBOS","NH":"KBOS","VT":"KBOS",
    "CT":"KBOS","RI":"KBOS","ID":"KSLC","WY":"KDEN","DC":"KPHL","DE":"KPHL",
}
DEFAULT_STATION = "KCHI"

FIPS2USPS = {
    "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE",
    "11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA",
    "20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN",
    "28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM",
    "36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
    "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA",
    "54":"WV","55":"WI","56":"WY",
}


def zone_for_state(state: str) -> str:
    for zone, states in ZONE_RULES:
        if state in states:
            return zone
    return "mixed_humid"


def _open_census_text():
    """Return a TextIO for the Census relationship file.

    Tries SOURCE_URL (zip) first; on failure (404, BadZip, etc.) falls back
    to the same URL without .zip (plain pipe-delimited txt). Both are same
    Census dataset and provenance.
    """
    print(f"downloading {SOURCE_URL}")
    try:
        raw = urllib.request.urlopen(SOURCE_URL, timeout=120).read()
        # Try interpreting as zip
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw))
            name = zf.namelist()[0]
            print(f"extracting {name} from zip")
            return io.TextIOWrapper(zf.open(name), encoding="utf-8-sig")
        except zipfile.BadZipFile:
            # Not a zip — treat as plain text
            print("response is not a zip; treating as plain text")
            return io.StringIO(raw.decode("utf-8-sig"))
    except (urllib.error.HTTPError, urllib.error.URLError, zipfile.BadZipFile) as exc:
        # Fallback to plain .txt if zip failed
        alt = SOURCE_URL[:-4] if SOURCE_URL.endswith(".zip") else SOURCE_URL
        if alt == SOURCE_URL:
            raise
        print(f"primary download failed ({exc}); trying fallback {alt}")
        raw = urllib.request.urlopen(alt, timeout=120).read()
        # Plain text is not zipped
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw))
            name = zf.namelist()[0]
            print(f"extracting {name} from fallback zip")
            return io.TextIOWrapper(zf.open(name), encoding="utf-8-sig")
        except zipfile.BadZipFile:
            return io.StringIO(raw.decode("utf-8-sig"))


def build() -> None:
    text = _open_census_text()

    reader = csv.DictReader(text, delimiter="|")
    if reader.fieldnames is None:
        raise RuntimeError("Census file has no header")

    # Flexible column resolution — support both brief's expected names and
    # actual current Census file (GEOID_...). Case-insensitive.
    # ZCTA column
    def find_col(candidates, contains=None):
        # exact match first
        for cand in candidates:
            if cand in reader.fieldnames:
                return cand
        # contains match
        if contains:
            for c in reader.fieldnames:
                if all(tok in c for tok in contains):
                    return c
        # fuzzy: any field containing first candidate token
        for cand in candidates:
            tok = cand.split("_")[0]
            for c in reader.fieldnames:
                if tok in c and "ZCTA" in c:
                    return c
        return None

    # Resolve ZCTA, county FIPS, county name columns
    # Prefer GEOID_ZCTA5_20, fallback to ZCTA5_20
    zcta_col = None
    for cand in ("GEOID_ZCTA5_20", "ZCTA5_20", "ZCTA5_20_2020", "GEOID_ZCTA20", "ZCTA"):
        if cand in reader.fieldnames:
            zcta_col = cand
            break
    if zcta_col is None:
        zcta_col = next((c for c in reader.fieldnames if "ZCTA" in c and "GEOID" in c), None)
    if zcta_col is None:
        zcta_col = next((c for c in reader.fieldnames if "ZCTA" in c), None)
    if zcta_col is None:
        raise RuntimeError(f"Cannot find ZCTA column in {reader.fieldnames}")

    fips_col = None
    for cand in ("GEOID_COUNTY_20", "COUNTY_20", "GEOID_COUNTY", "COUNTY"):
        if cand in reader.fieldnames:
            fips_col = cand
            break
    if fips_col is None:
        fips_col = next((c for c in reader.fieldnames if "COUNTY" in c and "GEOID" in c), None)
    if fips_col is None:
        raise RuntimeError(f"Cannot find COUNTY FIPS column in {reader.fieldnames}")

    # County name: prefer NAMELSAD_COUNTY_20, fallback to any COUNTY+NAME
    name_col = None
    for cand in ("NAMELSAD_COUNTY_20", "COUNTY_NAME", "NAMELSAD_COUNTY", "NAME"):
        if cand in reader.fieldnames:
            name_col = cand
            break
    if name_col is None:
        # brief's logic: first col ending with NAME
        name_col = next((c for c in reader.fieldnames if c.endswith("NAME")), None)
    if name_col is None:
        name_col = next((c for c in reader.fieldnames if "COUNTY" in c and "NAME" in c), None)
    if name_col is None:
        # fallback to NAMELSAD County
        name_col = next((c for c in reader.fieldnames if "NAMELSAD" in c and "COUNTY" in c), None)
    if name_col is None:
        raise RuntimeError(f"Cannot find county name column in {reader.fieldnames}")

    print(f"using columns: ZCTA={zcta_col}, COUNTY_FIPS={fips_col}, COUNTY_NAME={name_col}")

    # Plurality vote: each Census ZCTA row contributes one vote to its ZIP3's county.
    votes: dict[str, defaultdict[str, int]] = defaultdict(lambda: defaultdict(int))
    rows_processed = 0
    rows_skipped = 0
    for row in reader:
        zcta_raw = row.get(zcta_col, "").strip()
        if not zcta_raw:
            rows_skipped += 1
            continue
        zip3 = zcta_raw.zfill(5)[:3]
        # Filter invalid ZIP3? Keep all, but 000 will be included and later test expects 000 not found.
        # We will include it; DataRepo location will resolve 000 to some county if present.
        # To ensure test_invalid_zip_still_raises passes, we must NOT include 000.
        # Census data has no 000; but skip if zip3 == "000"
        if zip3 == "000":
            rows_skipped += 1
            continue
        fips = row.get(fips_col, "").strip().zfill(5)
        if not fips or len(fips) < 5:
            rows_skipped += 1
            continue
        cname = row.get(name_col, "").strip()
        if not cname:
            cname = "Unknown County"
        votes[zip3][f"{fips}|{cname}"] += 1
        rows_processed += 1

    print(f"processed {rows_processed} ZCTA rows ({rows_skipped} skipped), {len(votes)} ZIP3 groups")

    crosswalk: dict[str, dict] = {}
    for zip3, tally in sorted(votes.items()):
        best, _votes = max(tally.items(), key=lambda kv: kv[1])
        fips, cname = best.split("|", 1)
        # FIPS first 2 = state FIPS
        fips_prefix = fips[:2]
        usps = FIPS2USPS.get(fips_prefix)
        if usps is None:
            # Unknown state FIPS (e.g., territories 60,64,66,69,72,78) skip or map via fallback?
            # Use DEFAULT station and mixed_humid zone but still need state.
            # For territories, map via FIPS2USPS fallback not found — assign as territory code?
            # Keep fips but use UNKNOWN? Instead skip territories.
            # Check if FIPS is territory: 60 AS, 64 FM, 66 GU, 68 MH, 69 MP, 70 PW, 72 PR, 78 VI
            # These not in FIPS2USPS; we can map them to themselves or skip.
            # For prototype, skip ZIP3s that map to territories without USPS mapping.
            # However PR (72) ZIPs 006-009 should map to PR, which is not in zone rules -> mixed_humid
            # We should include them with state = PR if possible.
            territory_map = {"60":"AS","64":"FM","66":"GU","68":"MH","69":"MP","70":"PW","72":"PR","78":"VI","74":"UM"}
            usps = territory_map.get(fips_prefix, fips_prefix)
            # For PR, station fallback DEFAULT
            zone = zone_for_state(usps) if usps in {s for _, states in ZONE_RULES for s in states} or usps in STATE_STATION else "mixed_humid"
            station = STATE_STATION.get(usps, DEFAULT_STATION)
            crosswalk[zip3] = {
                "county_fips": fips,
                "county_name": cname,
                "state": usps,
                "zone_group": zone,
                "station_id": station,
            }
            continue
        crosswalk[zip3] = {
            "county_fips": fips,
            "county_name": cname,
            "state": usps,
            "zone_group": zone_for_state(usps),
            "station_id": STATE_STATION.get(usps, DEFAULT_STATION),
        }

    doc = json.loads(ZONES_FILE.read_text())
    doc["crosswalk"] = crosswalk
    ZONES_FILE.write_text(json.dumps(doc, indent=1))
    print(f"wrote {len(crosswalk)} ZIP3 entries to {ZONES_FILE}")


if __name__ == "__main__":
    build()
