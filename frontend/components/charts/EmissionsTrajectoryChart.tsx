"use client";

import { emissionsTrajectoryOption } from "@/lib/chartOptions";
import type { OptimizeResponse } from "@/lib/types";
import { EChart } from "./EChart";

export function EmissionsTrajectoryChart({
  optimize,
}: {
  optimize: OptimizeResponse;
}) {
  return (
    <EChart
      option={emissionsTrajectoryOption(optimize)}
      height={300}
      ariaLabel="Annual emissions trajectory after optimization versus the baseline total"
    />
  );
}
