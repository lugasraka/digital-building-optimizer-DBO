"use client";

import { useEffect, useState } from "react";

import { BuildingTypeCards } from "@/components/inputs/BuildingTypeCards";
import { FloorAreaInput } from "@/components/inputs/FloorAreaInput";
import { VintageSelect } from "@/components/inputs/VintageSelect";
import { ZipLookup } from "@/components/inputs/ZipLookup";
import { getApiClient } from "@/lib/api";
import type {
  BuildingType,
  FacilityInput,
  ReferenceBuildingType,
  ReferenceDemoZip,
  Vintage,
} from "@/lib/types";
import { validateFacility } from "@/lib/validation";
import { useWizard } from "@/store/wizard";

export default function FacilityPage() {
  const setFacility = useWizard((s) => s.setFacility);
  const storedFacility = useWizard((s) => s.facility);
  const error = useWizard((s) => s.error);

  const [buildingTypes, setBuildingTypes] = useState<ReferenceBuildingType[]>([]);
  const [demoZips, setDemoZips] = useState<ReferenceDemoZip[]>([]);
  const [zip, setZip] = useState(storedFacility?.zip_code ?? "");
  const [buildingType, setBuildingType] = useState<BuildingType>(
    storedFacility?.building_type ?? "office",
  );
  const [area, setArea] = useState(
    storedFacility ? String(storedFacility.floor_area_sqft) : "",
  );
  const [vintage, setVintage] = useState<Vintage | "">(
    storedFacility?.vintage ?? "",
  );

  useEffect(() => {
    const client = getApiClient();
    client.getBuildingTypes().then(setBuildingTypes).catch(() => {});
    client.getDemoZips().then(setDemoZips).catch(() => {});
  }, []);

  useEffect(() => {
    const facility: FacilityInput = {
      zip_code: zip,
      building_type: buildingType,
      floor_area_sqft: area === "" ? 0 : Number(area),
      vintage: vintage === "" ? null : vintage,
    };
    setFacility(facility);
  }, [zip, buildingType, area, vintage, setFacility]);

  const errors = validateFacility({
    zip_code: zip,
    building_type: buildingType,
    floor_area_sqft: area === "" ? 0 : Number(area),
    vintage: vintage === "" ? null : vintage,
  });

  return (
    <div className="space-y-8">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="font-semibold">{error.title}</p>
          <p className="mt-0.5">{error.detail}</p>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Where is your facility?
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          A 5-digit US ZIP code resolves climate zone, grid emissions, and
          local tariffs.
        </p>
        <div className="mt-4">
          <ZipLookup zip={zip} demoZips={demoZips} onChange={setZip} />
          {errors.zip_code && (
            <p className="mt-1 text-xs text-red-600">{errors.zip_code}</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          What kind of building?
        </h2>
        <div className="mt-4">
          <BuildingTypeCards
            value={buildingType}
            types={buildingTypes}
            onChange={setBuildingType}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          How big is it?
        </h2>
        <div className="mt-4 flex flex-wrap gap-8">
          <div>
            <FloorAreaInput value={area} onChange={setArea} />
            {errors.floor_area_sqft && (
              <p className="mt-1 text-xs text-red-600">
                {errors.floor_area_sqft}
              </p>
            )}
          </div>
          <VintageSelect value={vintage} onChange={setVintage} />
        </div>
      </section>
    </div>
  );
}
