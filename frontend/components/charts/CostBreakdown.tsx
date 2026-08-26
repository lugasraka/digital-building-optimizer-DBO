"use client";

import { costBreakdownOption } from "@/lib/chartOptions";
import type { BaselineResponse } from "@/lib/types";
import { EChart } from "./EChart";

export function CostBreakdown({ baseline }: { baseline: BaselineResponse }) {
  return (
    <EChart
      option={costBreakdownOption(baseline)}
      height={300}
      ariaLabel="Annual utility spend by electricity, demand charges, and gas"
    />
  );
}
