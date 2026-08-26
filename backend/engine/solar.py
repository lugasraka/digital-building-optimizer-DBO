import numpy as np

SYSTEM_LOSSES = 0.86


def poa_gain_factor(lat: float) -> float:
    """Annual POA/GHI ratio proxy for ~20deg tilt, lat-dependent."""
    return 1.05 + 0.004 * max(0.0, float(lat) - 25.0)


def pv_power_kw(size_kw: float, ghi_wm2: np.ndarray, temp_c: np.ndarray,
                lat: float) -> np.ndarray:
    """AC output, kW. Cell-temp derate 0.4%/degC above 25 on POA basis."""
    gain = poa_gain_factor(lat)
    poa = ghi_wm2 * gain
    tcell = temp_c + poa * 0.03
    derate = np.clip(1.0 - 0.004 * (tcell - 25.0), 0.5, 1.0)
    return size_kw * (poa / 1000.0) * derate * SYSTEM_LOSSES
