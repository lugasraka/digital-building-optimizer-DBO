import numpy as np
import pytest

from engine.solar import pv_power_kw


def test_no_output_without_irradiance():
    ghi = np.zeros(24)
    t = np.full(24, 20.0)
    assert (pv_power_kw(100.0, ghi, t, 37.6) == 0).all()


def test_output_scales_linearly_with_size():
    rng = np.random.default_rng(0)
    ghi = np.clip(rng.normal(400, 300, 8760), 0, None)
    t = rng.normal(18, 6, 8760)
    small = pv_power_kw(50.0, ghi, t, 37.6)
    big = pv_power_kw(200.0, ghi, t, 37.6)
    assert np.allclose(big, 4 * small)


def test_san_francisco_specific_yield_plausible(repo):
    df = repo.tmy("KSFO")
    annual_kwh_per_kw = pv_power_kw(
        1.0, df["ghi_wm2"].to_numpy(), df["temp_c"].to_numpy(),
        repo.station_lat("KSFO"),
    ).sum()
    assert 700 <= annual_kwh_per_kw <= 1200
