"use client";

import { monthlyLoadOption } from "@/lib/chartOptions";
import type { BaselineResponse } from "@/lib/types";
import { EChart } from "./EChart";

export function MonthlyLoadChart({ baseline }: { baseline: BaselineResponse }) {
  return (
    <EChart
      option={monthlyLoadOption(baseline)}
      height={320}
      ariaLabel="Monthly electricity consumption in kWh and gas in MMBtu"
    />
  );
}
