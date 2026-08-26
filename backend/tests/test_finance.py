import pytest

from engine.finance import (
    build_financial_summary, irr, macrs_npv, npv, project_capex,
    project_cashflows_capex, project_cashflows_eaas, simple_payback,
)
from engine.optimizer import Sizing


def test_capex_math():
    c = project_capex(Sizing(pv_kw=100.0, bess_kwh=200.0))
    assert c["gross"] == pytest.approx(100 * 1700 + 200 * 400)
    assert c["itc"] == pytest.approx(0.30 * (100 * 1700 + 200 * 400))
    assert c["net"] == pytest.approx(c["gross"] - c["itc"])


def test_macrs_npv_hand_computed():
    # 21% * 100k * sum(rate_t / 1.08^t) = 21% * 100k * 0.81129 ~= 17,037
    assert macrs_npv(100_000.0) == pytest.approx(17_037.0, abs=2.0)


def test_irr_known_solution():
    assert irr([-1000.0, 600.0, 600.0]) == pytest.approx(0.1307, abs=1e-3)


def test_npv_basic():
    assert npv([-100.0, 110.0]) == pytest.approx(110 / 1.08 - 100)


def test_simple_payback():
    assert simple_payback(100_000.0, 25_000.0) == pytest.approx(4.0)


def test_eaas_day_one_positive_and_fee_escalates():
    flows = project_cashflows_eaas(100_000.0)
    assert len(flows) == 16
    assert flows[0] == 0
    assert flows[1] == pytest.approx(15_000.0)
    assert flows[2] > flows[1]


def test_augmentation_dip_in_summary_cashflow():
    s = Sizing(bess_kwh=200.0)
    summ = build_financial_summary(s, yr1_savings=80_000.0, pv_share=0.5)
    flows = summ.capex_cashflow
    assert len(flows) == 16
    assert flows[11] < flows[10] - flows[10] * 0.05
