from engine.models import FinancialSummary
from engine.optimizer import Sizing

HP_MMBTUH_PER_TON = 0.012

PV_USD_PER_KW = 1700.0
BESS_USD_PER_KWH = 400.0
HP_USD_PER_TON = 1800.0
ITC_RATE = 0.30
TAX_RATE = 0.21
MACRS5 = [0.20, 0.32, 0.192, 0.1152, 0.1152, 0.0576]
DISCOUNT_RATE = 0.08
UTILITY_ESCALATION = 0.025
PV_DEGRADATION = 0.005
AUGMENT_YEAR = 11
AUGMENT_FRAC = 0.40
EAAS_FEE_SHARE = 0.85
EAAS_ESCALATOR = 0.02
ANALYSIS_YEARS = 15


def project_capex(s: Sizing, peak_thermal_mmbtu_h: float = 0.0) -> dict:
    hp_tons = s.hp_fraction * peak_thermal_mmbtu_h / HP_MMBTUH_PER_TON
    gross = (s.pv_kw * PV_USD_PER_KW
             + s.bess_kwh * BESS_USD_PER_KWH
             + hp_tons * HP_USD_PER_TON)
    itc = ITC_RATE * (s.pv_kw * PV_USD_PER_KW + s.bess_kwh * BESS_USD_PER_KWH)
    return {"gross": gross, "itc": itc, "net": gross - itc,
            "basis": gross, "hp_tons": hp_tons}


def macrs_npv(basis: float) -> float:
    factor = sum(r / (1 + DISCOUNT_RATE) ** t for t, r in enumerate(MACRS5, start=1))
    return TAX_RATE * basis * factor


def _savings_path(yr1: float, pv_share: float) -> list[float]:
    out = []
    for y in range(ANALYSIS_YEARS):
        sav = yr1 * (1 + UTILITY_ESCALATION) ** y * (1 - PV_DEGRADATION * pv_share) ** y
        out.append(sav)
    return out


def project_cashflows_capex(net_capex: float, yr1_savings: float,
                            pv_share: float) -> list[float]:
    flows = [-net_capex] + _savings_path(yr1_savings, pv_share)
    return flows


def project_cashflows_eaas(yr1_savings: float) -> list[float]:
    flows = [0.0]
    for y in range(ANALYSIS_YEARS):
        sav = yr1_savings * (1 + UTILITY_ESCALATION) ** y
        fee = EAAS_FEE_SHARE * yr1_savings * (1 + EAAS_ESCALATOR) ** y
        flows.append(sav - fee)
    return flows


def npv(cashflows: list[float]) -> float:
    return sum(cf / (1 + DISCOUNT_RATE) ** t for t, cf in enumerate(cashflows))


def irr(cashflows: list[float]) -> float | None:
    def f(r: float) -> float:
        return sum(cf / (1 + r) ** t for t, cf in enumerate(cashflows))

    lo, hi = -0.99, 10.0
    if f(lo) * f(hi) > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        if f(lo) * f(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def simple_payback(net_capex: float, yr1_savings: float) -> float | None:
    if yr1_savings <= 0:
        return None
    return net_capex / yr1_savings


def augmentation_cost(s: Sizing) -> float:
    return AUGMENT_FRAC * s.bess_kwh * BESS_USD_PER_KWH


def build_financial_summary(s: Sizing, yr1_savings: float, pv_share: float,
                            peak_thermal_mmbtu_h: float = 0.0) -> FinancialSummary:
    capex = project_capex(s, peak_thermal_mmbtu_h)
    path = _savings_path(yr1_savings, pv_share)

    capex_flows = [-capex["net"]] + path.copy()
    capex_flows[AUGMENT_YEAR] -= augmentation_cost(s)
    macrs_benefit = macrs_npv(capex["basis"])

    eaas_flows = project_cashflows_eaas(yr1_savings)

    return FinancialSummary(
        capex_gross_usd=capex["gross"],
        incentives_usd=capex["itc"],
        capex_net_usd=capex["net"],
        annual_savings_yr1_usd=float(yr1_savings),
        npv_usd=float(npv(capex_flows) + macrs_benefit),
        irr=irr(capex_flows),
        simple_payback_years=simple_payback(capex["net"], yr1_savings),
        eaas_annual_fee_yr1_usd=EAAS_FEE_SHARE * yr1_savings,
        eaas_npv_customer_benefit_usd=float(npv(eaas_flows)),
        capex_cashflow=[float(x) for x in capex_flows],
        eaas_net_cashflow=[float(x) for x in eaas_flows],
    )
