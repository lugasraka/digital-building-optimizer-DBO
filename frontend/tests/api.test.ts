import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "@/lib/api";

// Tests run from frontend/ (npm test), so cwd is the frontend root.
const FIXTURE_DIR = path.resolve(process.cwd(), "public/fixtures");

const FACILITY = {
  zip_code: "94105",
  building_type: "office" as const,
  floor_area_sqft: 50000,
};

function stubFixtureFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const name = url.split("/").pop() ?? "";
      const content = readFileSync(`${FIXTURE_DIR}/${name}`, "utf8");
      return new Response(content, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

describe("mock client", () => {
  beforeEach(stubFixtureFetch);
  afterEach(() => vi.unstubAllGlobals());

  it("postBaseline resolves a baseline with the exact field set", async () => {
    const client = createApiClient("http://x", true);
    const b = await client.postBaseline(FACILITY);
    for (const key of [
      "zip_code",
      "county_fips",
      "county_name",
      "state",
      "climate_zone_group",
      "tmy_station_id",
      "annual_electricity_kwh",
      "annual_gas_mmbtu",
      "scope1_tco2e",
      "scope2_tco2e",
      "total_tco2e",
      "peak_kw",
      "spend",
      "monthly",
      "hourly_electric_kw",
      "hourly_gas_mmbtu_per_hour",
      "data_provenance",
    ]) {
      expect(b).toHaveProperty(key);
    }
    expect(b.total_tco2e).toBeCloseTo(b.scope1_tco2e + b.scope2_tco2e, 1);
    expect(b.hourly_electric_kw).toHaveLength(8760);
  });

  it("postOptimize resolves an optimize response with hourly dispatch", async () => {
    const client = createApiClient("http://x", true);
    const o = await client.postOptimize({
      facility: FACILITY,
      scenario: {
        objective: "max_npv",
        assets: { pv: true, bess: true, heat_pump: true },
      },
    });
    expect(o.hourly_import_kw).toHaveLength(8760);
    expect(o.hourly_export_kw).toHaveLength(8760);
    expect(o.hourly_bess_soc_kwh).toHaveLength(8760);
    expect(o.sizing).not.toBeNull();
  });

  it("reference endpoints resolve from fixtures", async () => {
    const client = createApiClient("http://x", true);
    const types = await client.getBuildingTypes();
    expect(types).toHaveLength(6);
    expect(types[0]).toEqual({ value: "office", label: "Office" });
    const zips = await client.getDemoZips();
    expect(zips).toHaveLength(8);
    const a = await client.getAssumptions();
    expect(a.pv_usd_per_kw).toBe(1700);
    expect(a.gas_kgco2e_per_mmbtu).toBe(53.06);
  });
});

describe("live client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws ApiError with the problem payload on non-2xx", async () => {
    const problem = {
      type: "about:blank",
      title: "Unsupported ZIP code",
      status: 422,
      detail: "ZIP '00000' not in bundled crosswalk",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(problem), {
          status: 422,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );
    const client = createApiClient("http://api", false);
    await expect(
      client.postBaseline({ ...FACILITY, zip_code: "00000" }),
    ).rejects.toMatchObject({
      problem: { status: 422, detail: "ZIP '00000' not in bundled crosswalk" },
    });
  });

  it("posts JSON to the correct endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://api:8000/", false);
    await client.postBaseline(FACILITY);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:8000/api/v1/baseline",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(FACILITY),
      }),
    );
  });
});
