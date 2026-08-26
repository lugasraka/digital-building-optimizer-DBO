import numpy as np
import pandas as pd

from engine.data import Benchmark

HOURS_PER_YEAR = 8760
_INDEX = pd.date_range("2023-01-01", periods=HOURS_PER_YEAR, freq="h")


def hour_months() -> np.ndarray:
    return _INDEX.month.to_numpy().astype(int)


def hour_weekday_mask() -> np.ndarray:
    return (_INDEX.dayofweek.to_numpy() < 5)


def _occupancy(weekend_scale: float) -> np.ndarray:
    occ = np.where(hour_weekday_mask(), 1.0, weekend_scale)
    return occ / occ.sum()


def _degree_term(temps: np.ndarray, balance: float, invert: bool) -> np.ndarray:
    deg = (temps - balance) if not invert else (balance - temps)
    deg = np.clip(deg, 0.0, None)
    total = deg.sum()
    return deg / total if total > 0 else np.zeros_like(deg)


def synthesize_electric(b: Benchmark, annual_kwh: float, temps_c: np.ndarray) -> np.ndarray:
    fracs = b.end_use_fractions
    occ = _occupancy(b.weekend_scale)
    out = annual_kwh * fracs["flat"] * occ
    out += annual_kwh * fracs["cooling"] * _degree_term(temps_c, b.balance_temps_c["cool"], False)
    out += annual_kwh * fracs["heating"] * _degree_term(temps_c, b.balance_temps_c["heat"], True)
    return out


def synthesize_gas(b: Benchmark, annual_mmbtu: float, temps_c: np.ndarray) -> np.ndarray:
    occ = _occupancy(b.weekend_scale)
    out = annual_mmbtu * b.gas_flat_fraction * occ
    heat_share = 1.0 - b.gas_flat_fraction
    out += annual_mmbtu * heat_share * _degree_term(temps_c, b.balance_temps_c["heat"], True)
    return out
