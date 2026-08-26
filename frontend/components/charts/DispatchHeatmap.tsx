"use client";

import { useState } from "react";

import { bessSocHeatmapOption, dispatchHeatmapOption } from "@/lib/chartOptions";
import type { OptimizeResponse } from "@/lib/types";
import { EChart } from "./EChart";

type View = "import" | "soc";

export function DispatchHeatmap({ optimize }: { optimize: OptimizeResponse }) {
  const [view, setView] = useState<View>("import");
  const option =
    view === "import"
      ? dispatchHeatmapOption(optimize.hourly_import_kw)
      : bessSocHeatmapOption(optimize.hourly_bess_soc_kwh);

  const btn = (v: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        view === v
          ? "bg-brand-700 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex gap-2">
        {btn("import", "Grid import")}
        {btn("soc", "Battery state of charge")}
      </div>
      <EChart
        option={option}
        height={360}
        ariaLabel={
          view === "import"
            ? "Hourly grid import heatmap by month and hour"
            : "Hourly battery state of charge heatmap by month and hour"
        }
      />
    </div>
  );
}
