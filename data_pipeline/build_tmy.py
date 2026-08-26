"""Generates the representative meteorological year dataset (synthetic TMY).

Deterministic (seed 42). Physics-based approximations: clear-sky irradiance
from solar geometry, temperature from seasonal anchors + diurnal sine.
Run from repo root: python data_pipeline/build_tmy.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "backend" / "data"
SEED = 42
HOURS = 8760

# id, name, state, zone_group, tjan, tjul, amp(diurnal), cloud_factor
STATIONS = [
    ("KSFO","San Francisco","CA","mixed_dry_marine",10.0,17.0,6.0,0.55),
    ("KNYC","New York","NY","mixed_humid",0.5,25.0,7.0,0.60),
    ("KCHI","Chicago","IL","very_cold_cold",-5.0,24.0,7.5,0.55),
    ("KHOU","Houston","TX","hot_humid",13.0,29.5,8.0,0.55),
    ("KPHX","Phoenix","AZ","hot_dry",14.0,35.5,11.0,0.85),
    ("KATL","Atlanta","GA","mixed_humid",7.5,27.0,8.5,0.55),
    ("KDEN","Denver","CO","very_cold_cold",-1.5,24.5,11.0,0.70),
    ("KSEA","Seattle","WA","mixed_dry_marine",5.0,19.5,7.0,0.45),
    ("KBOS","Boston","MA","very_cold_cold",-1.0,23.5,7.0,0.58),
    ("KMIA","Miami","FL","hot_humid",20.5,28.5,6.0,0.62),
    ("KLAX","Los Angeles","CA","mixed_dry_marine",14.0,23.5,5.5,0.70),
    ("KDTW","Detroit","MI","very_cold_cold",-3.5,23.0,7.5,0.52),
    ("KPHL","Philadelphia","PA","mixed_humid",1.0,25.5,7.5,0.58),
    ("KMSP","Minneapolis","MN","very_cold_cold",-10.0,23.0,8.5,0.58),
    ("KSLC","Salt Lake City","UT","very_cold_cold",-1.0,27.0,10.0,0.65),
    ("KDFW","Dallas","TX","hot_humid",9.5,30.5,9.5,0.60),
    ("KCLT","Charlotte","NC","mixed_humid",6.5,26.5,8.5,0.55),
    ("KLAS","Las Vegas","NV","hot_dry",12.5,34.5,12.0,0.85),
    ("KPDX","Portland","OR","mixed_dry_marine",5.0,21.0,8.0,0.45),
    ("KSAN","San Diego","CA","mixed_dry_marine",14.5,23.0,4.5,0.68),
    ("KOAK","Oakland","CA","mixed_dry_marine",10.5,17.5,6.0,0.60),
    ("KSAT","San Antonio","TX","hot_humid",11.5,29.5,9.5,0.58),
    ("KJAX","Jacksonville","FL","hot_humid",14.0,28.0,8.0,0.58),
    ("KMEM","Memphis","TN","hot_humid",6.5,28.5,9.0,0.55),
    ("KOKC","Oklahoma City","OK","hot_dry",5.5,28.5,10.5,0.62),
    ("KBNA","Nashville","TN","mixed_humid",5.0,27.0,9.0,0.52),
    ("KCLE","Cleveland","OH","very_cold_cold",-2.5,22.5,7.0,0.50),
    ("KIND","Indianapolis","IN","very_cold_cold",-2.0,23.5,8.0,0.52),
    ("KMKE","Milwaukee","WI","very_cold_cold",-6.5,22.0,7.5,0.52),
]

STATION_LAT = {
    "KSFO": 37.6, "KNYC": 40.8, "KCHI": 42.0, "KHOU": 29.6, "KPHX": 33.4,
    "KATL": 33.6, "KDEN": 39.8, "KSEA": 47.4, "KBOS": 42.4, "KMIA": 25.8,
    "KLAX": 33.9, "KDTW": 42.2, "KPHL": 39.9, "KMSP": 44.9, "KSLC": 40.9,
    "KDFW": 32.9, "KCLT": 35.2, "KLAS": 36.1, "KPDX": 45.6, "KSAN": 32.7,
    "KOAK": 37.7, "KSAT": 29.5, "KJAX": 30.5, "KMEM": 34.9, "KOKC": 35.4,
    "KBNA": 36.1, "KCLE": 41.4, "KIND": 39.7, "KMKE": 43.0,
}


def build_station(idx: int, sid: str, tjan: float, tjul: float,
                  amp: float, cf: float, rng: np.random.Generator
                  ) -> pd.DataFrame:
    hour = np.arange(HOURS)
    doy = hour / 24.0
    hod = hour % 24
    frac = (1 - np.cos(2 * np.pi * (doy - 15) / 365)) / 2  # 0 mid-Jan, 1 mid-Jul
    seasonal = tjan + (tjul - tjan) * frac
    diurnal = amp * (-np.cos(2 * np.pi * (hod - 3) / 24) + 1) / 2
    temp_c = seasonal + diurnal - amp / 2 + rng.normal(0, 1.2, HOURS)

    lat = STATION_LAT[sid]
    decl = np.deg2rad(23.45) * np.sin(2 * np.pi * (284 + doy) / 365)
    ha = np.deg2rad(15 * ((hod - 0.5) - 12))  # solar noon offset per hour center
    sin_elev = (np.sin(np.deg2rad(lat)) * np.sin(decl)
                + np.cos(np.deg2rad(lat)) * np.cos(decl) * np.cos(ha))
    clear_sky = np.clip(sin_elev, 0, None) * 1000 * 0.72
    noise = rng.normal(1.0, 0.05, HOURS)
    ghi = np.clip(clear_sky * cf * noise, 0, None)

    return pd.DataFrame({"station_id": sid, "hour": hour,
                         "temp_c": np.round(temp_c, 2), "ghi_wm2": np.round(ghi, 1)})


if __name__ == "__main__":
    rng = np.random.default_rng(SEED)
    frames = []
    meta = []
    for i, (sid, name, st, zg, tjan, tjul, amp, cf) in enumerate(STATIONS):
        srng = np.random.default_rng(SEED + i)  # independent stream per station
        frames.append(build_station(i, sid, tjan, tjul, amp, cf, srng))
        meta.append({"id": sid, "name": name, "state": st, "zone_group": zg,
                     "lat": STATION_LAT[sid]})
    out = pd.concat(frames, ignore_index=True)
    DATA.mkdir(parents=True, exist_ok=True)
    out.to_parquet(DATA / "tmy_profiles.parquet", index=False)
    (DATA / "stations.json").write_text(json.dumps(meta, indent=1))
    print(f"wrote {len(meta)} stations x {HOURS} hours")
