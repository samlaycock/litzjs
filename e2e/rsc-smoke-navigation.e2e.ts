import { expect, test } from "@playwright/test";

test.describe("smoke fixture navigation", () => {
  test("serves the root document route", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Litz RSC Smoke" }).first()).toBeVisible();
    await expect(page.getByText("Not Found")).not.toBeVisible();
  });

  test("renders representative document routes during dev navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Feature: Loader Data" })).toBeVisible();

    await page.getByRole("link", { name: "Feature: Loader Data" }).click();

    await expect(page).toHaveURL("/features/loader-data");
    await expect(page.getByRole("heading", { name: "Data Loader Route" })).toBeVisible();
    await expect(page.getByText("Name: Litz Tester")).toBeVisible();

    await page.goto("/features/loader-view");
    await expect(page.getByRole("heading", { name: "View Loader Route" })).toBeVisible();
  });

  test("keeps link intent on the current route and navigates on click", async ({ page }) => {
    await page.goto("/");

    const loaderDataLink = page.getByRole("link", { name: "Feature: Loader Data" });

    await loaderDataLink.hover();

    await expect(page).toHaveURL("/");

    await loaderDataLink.click();

    await expect(page).toHaveURL("/features/loader-data");
    await expect(page.getByRole("heading", { name: "Data Loader Route" })).toBeVisible();
  });

  test("resets scroll and focuses the main landmark after route navigation", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 500 });
    await page.goto("/");
    await page.addStyleTag({
      content: "body { min-height: 2400px; } main { display: block; min-height: 1200px; }",
    });
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect(page.evaluate(() => window.scrollY)).resolves.toBe(900);

    await page.getByRole("link", { name: "Feature: Loader Data" }).click();

    await expect(page).toHaveURL("/features/loader-data");
    await expect(page.getByRole("heading", { name: "Data Loader Route" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(
      page.getByRole("main").evaluate((main) => document.activeElement === main),
    ).resolves.toBe(true);
    await expect(page.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });

  test("updates client component state in the shared shell", async ({ page }) => {
    await page.goto("/");

    const counter = page.getByRole("button", { name: "Clicks for user-001: 0" });
    await counter.click();

    await expect(page.getByRole("button", { name: "Clicks for user-001: 1" })).toBeVisible();
  });
});
