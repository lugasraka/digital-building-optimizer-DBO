"use client";

import type { BaselineResponse, FacilityInput, OptimizeResponse, ResilienceResponse } from "@/lib/types";

export async function downloadPdfReport({
  facility,
  baseline,
  optimize,
  resilience,
  buildingTypeLabel,
}: {
  facility: FacilityInput;
  baseline: BaselineResponse;
  optimize: OptimizeResponse;
  resilience: ResilienceResponse;
  buildingTypeLabel: string;
}): Promise<void> {
  // Browser-safe APIs only: renderToBuffer/renderToStream throw on the web build.
  const [{ pdf }, React, { SummaryReport }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("react"),
    import("@/components/pdf/SummaryReport"),
  ]);
  const doc = React.createElement(SummaryReport, {
    facility,
    baseline,
    optimize,
    resilience,
    buildingTypeLabel,
  });
  const blob = await pdf(doc as never).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dbo-report-${facility.zip_code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
