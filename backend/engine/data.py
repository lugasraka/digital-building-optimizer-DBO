import json
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

import pandas as pd

from engine.errors import UnsupportedBuildingType, UnsupportedZip

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


@dataclass(frozen=True)
class Location:
    county_fips: str
    county_name: str
    state: str
    zone_group: str
    station_id: str


@dataclass(frozen=True)
class Tariff:
    co2e_kg_per_mwh: float
    elec_usd_kwh: float
    demand_usd_kw_month: float
    gas_usd_therm: float


@dataclass(frozen=True)
class Benchmark:
    elec_kwh_sqft: float
    gas_kwh_sqft: float
    end_use_fractions: dict
    gas_flat_fraction: float
    balance_temps_c: dict
    weekend_scale: float


class DataRepo:
    """Loads bundled reference datasets. Read-only, process-wide singleton via get_repo()."""

    def __init__(self, data_dir: Path | None = None) -> None:
        self._dir = Path(data_dir) if data_dir else DATA_DIR

    def _load(self, name: str) -> dict:
        return json.loads((self._dir / name).read_text())

    @cached_property
    def _zones(self) -> dict:
        return self._load("climate_zones.json")

    @cached_property
    def _grid(self) -> dict:
        return self._load("grid_factors.json")

    @cached_property
    def _eui(self) -> dict:
        return self._load("eui_benchmarks.json")

    def building_types(self) -> list[str]:
        return list(self._eui["base"].keys())

    def location(self, zip5: str) -> Location:
        entry = self._zones["demo_zips"].get(zip5) or self._zones.get("crosswalk", {}).get(zip5[:3])
        if entry is None:
            raise UnsupportedZip(f"ZIP {zip5!r} not in bundled crosswalk")
        return Location(
            county_fips=entry["county_fips"],
            county_name=entry["county_name"],
            state=entry["state"],
            zone_group=entry["zone_group"],
            station_id=entry["station_id"],
        )

    def tariff(self, state: str) -> Tariff:
        for row in self._grid["rows"]:
            if row["state"] == state:
                return Tariff(**{k: row[k] for k in Tariff.__dataclass_fields__})
        d = self._grid["DEFAULT"]
        return Tariff(d["co2e_kg_per_mwh"], d["elec_usd_kwh"], d["demand_usd_kw_month"], d["gas_usd_therm"])

    def benchmark(self, building_type: str, zone_group: str, vintage: str) -> Benchmark:
        base = self._eui["base"].get(building_type)
        if base is None or building_type not in self._eui["profiles"]:
            raise UnsupportedBuildingType(f"unknown building type {building_type!r}")
        zm = self._eui["zone_multipliers"][zone_group]
        vm = self._eui["vintage_multipliers"][vintage]
        prof = self._eui["profiles"][building_type]
        return Benchmark(
            elec_kwh_sqft=base["electricity"] * zm * vm,
            gas_kwh_sqft=base["gas"] * zm * vm,
            end_use_fractions=prof["end_use_fractions"],
            gas_flat_fraction=prof["gas_flat_fraction"],
            balance_temps_c=prof["balance_temps_c"],
            weekend_scale=prof["weekend_scale"],
        )

    @cached_property
    def _tmy_frame(self) -> pd.DataFrame:
        return pd.read_parquet(self._dir / "tmy_profiles.parquet")

    def tmy(self, station_id: str) -> pd.DataFrame:
        df = self._tmy_frame[self._tmy_frame["station_id"] == station_id]
        return df.set_index("hour")[["temp_c", "ghi_wm2"]].sort_index()

    @cached_property
    def _stations_meta(self) -> list[dict]:
        return json.loads((self._dir / "stations.json").read_text())

    def station_lat(self, station_id: str) -> float:
        return next(s for s in self._stations_meta if s["id"] == station_id)["lat"]


_repo: DataRepo | None = None


def get_repo() -> DataRepo:
    global _repo
    if _repo is None:
        _repo = DataRepo()
    return _repo
