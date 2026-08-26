"use client";

import { cashflowOption } from "@/lib/chartOptions";
import type { FinancialSummary } from "@/lib/types";
import { EChart } from "./EChart";

export function CashflowChart({
  financials,
}: {
  financials: FinancialSummary;
}) {
  return (
    <EChart
      option={cashflowOption(financials)}
      height={320}
      ariaLabel="Cumulative cashflow comparison of direct CapEx versus Energy-as-a-Service"
    />
  );
}
