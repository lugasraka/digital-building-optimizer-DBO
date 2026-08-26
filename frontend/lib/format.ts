const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const rounded = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const twoDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function formatUsd(n: number): string {
  return usd.format(n);
}

export function formatKwh(n: number): string {
  return `${rounded.format(n)} kWh`;
}

export function formatMmbtu(n: number): string {
  return `${rounded.format(n)} MMBtu`;
}

export function formatTco2e(n: number): string {
  return `${oneDecimal.format(n)} tCO₂e`;
}

export function formatKw(n: number): string {
  return `${rounded.format(n)} kW`;
}

export function formatPercent(n: number): string {
  return `${oneDecimal.format(n)}%`;
}

export function formatYears(n: number): string {
  return `${twoDecimal.format(n)} yr`;
}
