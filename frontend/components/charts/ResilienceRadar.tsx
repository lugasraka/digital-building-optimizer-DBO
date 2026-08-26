"use client";

import { resilienceRadarOption } from "@/lib/chartOptions";
import type { ResilienceResponse } from "@/lib/types";
import { EChart } from "./EChart";

export function ResilienceRadar({
  resilience,
}: {
  resilience: ResilienceResponse;
}) {
  return (
    <EChart
      option={resilienceRadarOption(resilience)}
      height={320}
      ariaLabel="Resilience hazard scores before and after mitigation"
    />
  );
}
