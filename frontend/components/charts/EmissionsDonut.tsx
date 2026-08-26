"use client";

import { emissionsDonutOption } from "@/lib/chartOptions";
import type { BaselineResponse } from "@/lib/types";
import { EChart } from "./EChart";

export function EmissionsDonut({ baseline }: { baseline: BaselineResponse }) {
  return (
    <EChart
      option={emissionsDonutOption(baseline)}
      height={300}
      ariaLabel="Annual emissions split between Scope 1 gas and Scope 2 grid"
    />
  );
}
