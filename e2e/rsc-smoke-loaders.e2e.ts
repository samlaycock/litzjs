import { expect, test } from "@playwright/test";

test.describe("smoke fixture loaders and views", () => {
  test("renders data loader output and idle status", async ({ page }) => {
    await page.goto("/features/loader-data");

    await expect(page.getByRole("heading", { name: "Data Loader Route" })).toBeVisible();
    await expect(page.getByText("Name: Litz Tester")).toBeVisible();
    await expect(page.getByText("Email: tester@example.com")).toBeVisible();
    await expect(page.getByText("Status: idle")).toBeVisible();
  });

  test("renders view loader output and interactive client islands", async ({ page }) => {
    await page.goto("/features/loader-view");

    await expect(page.getByRole("heading", { name: "View Loader Route" })).toBeVisible();
    await expect(page.getByText("Kind: view")).toBeVisible();
    await expect(page.getByText("This panel came from a route loader using view().")).toBeVisible();

    const counter = page.getByRole("button", { name: /Report clicks: 0/ });
    await counter.click();
    await expect(page.getByRole("button", { name: /Report clicks: 1/ })).toBeVisible();
  });

  test("renders route.useView() fragments", async ({ page }) => {
    await page.goto("/features/use-view");

    await expect(page.getByRole("heading", { name: "useView Example" })).toBeVisible();
    await expect(page.getByText("This fragment came from route.useView().")).toBeVisible();
  });

  test("renders nested layout matches", async ({ page }) => {
    await page.goto("/features/layouts");

    await expect(page.getByRole("heading", { name: "Feature: Layouts" })).toBeVisible();
    await expect(page.getByText("Section: Feature Examples")).toBeVisible();
    await expect(page.getByText("Layout: Nested Layout Demo")).toBeVisible();
    await expect(page.getByText("Route content inside recursive layouts.")).toBeVisible();
    await expect(
      page.getByText(
        "Matches: /layouts/features -> /layouts/features/layouts -> /features/layouts",
      ),
    ).toBeVisible();
  });

  test("renders search params from loader and hook state", async ({ page }) => {
    await page.goto("/features/search-params?term=litz&tab=active");

    await expect(page.getByRole("heading", { name: "Search Params" })).toBeVisible();
    await expect(page.getByText("Loader term: litz")).toBeVisible();
    await expect(page.getByText("Loader tab: active")).toBeVisible();
    await expect(page.getByText("Hook term: litz")).toBeVisible();
    await expect(page.getByText("Hook tab: active")).toBeVisible();
  });

  test("updates route search params in place without replacing the mounted route", async ({
    page,
  }) => {
    await page.goto("/features/search-params?term=litz&tab=active");

    await page.getByRole("button", { name: "Update search in-place" }).click();

    await expect(page).toHaveURL("/features/search-params?term=bun&tab=recent");
    await expect(page.getByRole("heading", { name: "Search Params" })).toBeVisible();
    await expect(page.getByText("Loader term: bun")).toBeVisible();
    await expect(page.getByText("Loader tab: recent")).toBeVisible();
    await expect(page.getByText("Hook term: bun")).toBeVisible();
    await expect(page.getByText("Hook tab: recent")).toBeVisible();
    await expect(page.getByText("Route module did not export route.")).toBeHidden();
  });
});
