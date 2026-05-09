import { expect, test } from "@playwright/test";

test.describe("smoke fixture resources", () => {
  test("renders data resources with params and search", async ({ page }) => {
    await page.goto("/features/resource-data");

    await expect(page.getByRole("heading", { name: "Resource Data" })).toBeVisible();
    await expect(page.getByText("Id: alpha")).toBeVisible();
    await expect(page.getByText("Title: Summary for alpha")).toBeVisible();
    await expect(page.getByText("Mode: compact")).toBeVisible();
  });

  test("submits resource actions and refreshes the resource view", async ({ page }) => {
    await page.goto("/features/resource-actions");

    await expect(page.getByRole("heading", { name: "Resource Action Route" })).toBeVisible();
    await expect(page.getByText("Feed id: team")).toBeVisible();
    await expect(page.getByText("Initial team update")).toBeVisible();

    await page.getByPlaceholder("New feed item").fill("Resource E2E update");
    await page.getByRole("button", { name: "Add feed item" }).click();

    await expect(page.getByText("Resource E2E update")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add feed item" })).toBeVisible();
  });
});
