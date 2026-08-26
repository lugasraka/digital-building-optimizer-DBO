import numpy as np

from engine.data import DataRepo


def test_tmy_shape_and_columns(repo):
    df = repo.tmy("KSFO")
    assert len(df) == 8760
    assert list(df.columns) == ["temp_c", "ghi_wm2"]
    assert df.index.name == "hour"


def test_tmy_deterministic(repo):
    a = repo.tmy("KPHX")["temp_c"].to_numpy()
    b = repo.tmy("KPHX")["temp_c"].to_numpy()
    assert np.array_equal(a, b)


def test_seasonality_direction():
    df = DataRepo().tmy("KCHI")
    jan_mean = df["temp_c"].iloc[:24 * 15].mean()
    jul_mean = df["temp_c"].iloc[24 * 195 : 24 * 210].mean()
    assert jul_mean > jan_mean + 15


def test_ghi_bounds_and_night_zero(repo):
    df = repo.tmy("KPHX")
    assert (df["ghi_wm2"] >= 0).all()
    assert (df["ghi_wm2"] <= 1200).all()
    assert (df["ghi_wm2"].iloc[[0, 1, 2, 8758, 8759]] == 0).all()
