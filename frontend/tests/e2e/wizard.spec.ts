import { expect, test } from "@playwright/test";

test("full wizard happy path in mock mode", async ({ page }) => {
  // Landing redirects into the wizard.
  await page.goto("/");
  await expect(page).toHaveURL(/\/wizard\/facility/);

  // Facility step: quick-pick a demo ZIP, enter floor area.
  await page.getByRole("button", { name: "San Francisco, CA" }).click();
  await page.getByLabel("Floor area (sqft)").fill("50000");
  await expect(
    page.getByRole("button", { name: "Office", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Baseline step: auto-runs and renders metrics + charts.
  await expect(page).toHaveURL(/\/wizard\/baseline/);
  await expect(page.getByText("Emissions by scope")).toBeVisible();
  await expect(page.getByText("Annual utility spend")).toBeVisible();
  await expect(page.getByText("Monthly load profile")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Scenario step: defaults are valid, just advance.
  await expect(page).toHaveURL(/\/wizard\/scenario/);
  await expect(page.getByText("Which assets can be deployed?")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Results step: optimize + resilience render.
  await expect(page).toHaveURL(/\/wizard\/results/);
  await expect(page.getByText("Recommended asset package")).toBeVisible();
  await expect(page.getByText("Grid import")).toBeVisible();
  await expect(page.getByText("CapEx vs Energy-as-a-Service")).toBeVisible();
  await expect(page.getByText("Climate resilience")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Summary step: recommendation text + CSV download.
  await expect(page).toHaveURL(/\/wizard\/summary/);
  await expect(page.getByText("Executive summary")).toBeVisible();
  await expect(page.getByText("Recommended package:")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/dbo-summary-94105\.csv/);
});
