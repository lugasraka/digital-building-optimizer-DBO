"use client";

import { useEffect } from "react";

import { AssetToggles } from "@/components/inputs/AssetToggles";
import { ObjectiveSelector } from "@/components/inputs/ObjectiveSelector";
import { TargetSlider } from "@/components/inputs/TargetSlider";
import { AssumptionsPanel } from "@/components/results/AssumptionsPanel";
import type { AssetToggles as AssetTogglesType, ObjectiveMode } from "@/lib/types";
import { useWizard } from "@/store/wizard";

export default function ScenarioPage() {
  const scenario = useWizard((s) => s.scenario);
  const setScenario = useWizard((s) => s.setScenario);

  // When the target mode is first selected, default the target to 40%.
  useEffect(() => {
    if (
      scenario.objective === "target_co2" &&
      scenario.co2_reduction_target_pct === null
    ) {
      setScenario({ co2_reduction_target_pct: 40 });
    }
  }, [scenario.objective, scenario.co2_reduction_target_pct, setScenario]);

  const setObjective = (objective: ObjectiveMode) =>
    setScenario({ objective });

  const setAssets = (assets: AssetTogglesType) => setScenario({ assets });

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          What should the optimizer target?
        </h2>
        <div className="mt-4">
          <ObjectiveSelector value={scenario.objective} onChange={setObjective} />
        </div>
        {scenario.objective === "target_co2" && (
          <div className="mt-6">
            <TargetSlider
              value={scenario.co2_reduction_target_pct ?? null}
              onChange={(v) => setScenario({ co2_reduction_target_pct: v })}
            />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Which assets can be deployed?
        </h2>
        <div className="mt-4">
          <AssetToggles value={scenario.assets} onChange={setAssets} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Model assumptions (prototype)
        </h2>
        <div className="mt-3">
          <AssumptionsPanel />
        </div>
      </section>
    </div>
  );
}
