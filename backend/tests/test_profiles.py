import pytest

import numpy as np

from engine.data import DataRepo
from engine.profiles import HOURS_PER_YEAR, hour_months, synthesize_gas, synthesize_electric


def test_hour_months_is_nonleap_calendar():
    m = hour_months()
    assert len(m) == HOURS_PER_YEAR
    assert m[0] == 1 and m[-1] == 12
    assert set(np.unique(m)) == set(range(1, 13))


def test_electric_conserves_annual_total(repo):
    b = repo.benchmark("office", "mixed_humid", "1980_2004")
    temps = repo.tmy("KCHI")["temp_c"].to_numpy()
    p = synthesize_electric(b, annual_kwh=700_000.0, temps_c=temps)
    assert len(p) == HOURS_PER_YEAR
    assert (p >= 0).all()
    assert p.sum() == pytest.approx(700_000.0, rel=1e-9)


def test_gas_conserves_annual_total(repo):
    b = repo.benchmark("hospital", "hot_humid", "post2004")
    temps = repo.tmy("KMIA")["temp_c"].to_numpy()
    g = synthesize_gas(b, annual_mmbtu=4_000.0, temps_c=temps)
    assert g.sum() == pytest.approx(4_000.0, rel=1e-9)
    assert (g >= 0).all()


def test_office_summer_afternoon_peak_exceeds_winter(repo):
    b = repo.benchmark("office", "mixed_humid", "1980_2004")
    temps = repo.tmy("KHOU")["temp_c"].to_numpy()
    p = synthesize_electric(b, annual_kwh=500_000.0, temps_c=temps)
    july = p[hour_months() == 7]
    january = p[hour_months() == 1]
    assert july.mean() > january.mean()
