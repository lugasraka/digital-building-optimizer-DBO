import { test, expect } from "@playwright/test";
import * as fs from "fs";

test("summary page generates a valid PDF report", async ({ page }) => {
  await page.goto("/wizard/facility");
  await page.getByRole("button", { name: "San Francisco, CA" }).click();
  await page.getByLabel("Floor area (sqft)").fill("50000");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Emissions by scope")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Which assets can be deployed?")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Recommended asset package")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Executive summary")).toBeVisible();

  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: "Download PDF report" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/dbo-report-94105\.pdf/);
  const path = await download.path();
  const head = fs.readFileSync(path!).subarray(0, 5).toString();
  expect(head).toBe("%PDF-");
});
