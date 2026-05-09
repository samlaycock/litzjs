import { expect, test } from "@playwright/test";

test.describe("smoke fixture server contracts", () => {
  test("serves API routes through route components", async ({ page }) => {
    await page.goto("/features/api-route");

    await expect(page.getByRole("heading", { name: "API Route Demo" })).toBeVisible();
    await expect(page.getByText("ok via litz-fixture")).toBeVisible();
  });

  test("runs route middleware and preserves middleware-provided context", async ({ page }) => {
    await page.goto("/features/middleware");

    await expect(page.getByRole("heading", { name: "Middleware" })).toBeVisible();
    await expect(page.getByText("Order: seed-trace -> attach-note")).toBeVisible();
    await expect(page.getByText("Note: middleware updated context")).toBeVisible();
  });

  test("follows loader redirects with replacement search state", async ({ page }) => {
    await page.goto("/features/redirect-loader");

    await expect(page).toHaveURL("/features/redirect-target?from=loader&mode=replace");
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
    await expect(page.getByText("Redirect source: loader")).toBeVisible();
    await expect(page.getByText("History mode: replace")).toBeVisible();
  });

  test("renders explicit and default route error boundaries", async ({ page }) => {
    await page.goto("/features/error-boundary");

    await expect(page.getByRole("heading", { name: "Boundary Error Route" })).toBeVisible();
    await expect(page.getByText("fault 503: Broken route with explicit boundary")).toBeVisible();

    await page.goto("/features/error-default");

    await expect(page.getByRole("heading", { name: "Route Error" })).toBeVisible();
    await expect(page.getByText("fault 500: Broken route with default fallback")).toBeVisible();
  });
});
