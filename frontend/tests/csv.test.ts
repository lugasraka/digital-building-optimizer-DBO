import { describe, expect, it } from "vitest";

import { summaryCsv } from "@/lib/csv";
import { minBaseline, minOptimize, minResilience } from "./helpers";

describe("summaryCsv", () => {
  it("contains all three sections with correct row counts", () => {
    const csv = summaryCsv({
      baseline: minBaseline(),
      optimize: minOptimize(),
      resilience: minResilience(),
    });
    expect(csv).toContain("Baseline monthly");
    expect(csv).toContain("Emissions trajectory");
    expect(csv).toContain("Cashflows (cumulative)");
    // 12 monthly rows, 15 trajectory rows, 16 cashflow rows
    expect(csv.split("\n")).toHaveLength(3 + 12 + 3 + 15 + 3 + 16);
  });

  it("emits cumulative cashflow values", () => {
    const csv = summaryCsv({
      baseline: minBaseline(),
      optimize: minOptimize(),
      resilience: minResilience(),
    });
    const lines = csv.split("\n");
    const cashIdx = lines.indexOf("Cashflows (cumulative)");
    const year0 = lines[cashIdx + 2].split(",");
    expect(year0).toEqual(["0", "-595000", "12000"]);
  });

  it("ends with a trailing newline", () => {
    const csv = summaryCsv({
      baseline: minBaseline(),
      optimize: minOptimize(),
      resilience: minResilience(),
    });
    expect(csv.endsWith("\n")).toBe(true);
  });
});
