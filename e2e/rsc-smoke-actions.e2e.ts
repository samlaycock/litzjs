import { expect, test } from "@playwright/test";

test.describe("smoke fixture route actions", () => {
  test("submits a form action that returns a streamed view", async ({ page }) => {
    await page.goto("/features/action-view");

    await expect(page.getByRole("heading", { name: "Action + View Route" })).toBeVisible();
    await expect(page.getByText("Alpha")).toBeVisible();
    await expect(page.getByText("Beta")).toBeVisible();

    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("alert")).toContainText("Project name is required");

    await page.getByPlaceholder("New project name").fill("Gamma E2E");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("Most recent action view: ready")).toBeVisible();
    await expect(page.getByText("Gamma E2E")).toBeVisible();
  });

  test("supports imperative submit success, invalid, and explicit error branches", async ({
    page,
  }) => {
    await page.goto("/features/submit-imperative");

    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Required")).toBeVisible();

    await page.getByPlaceholder("Project name").fill("error");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Action error: Project name 'error' is reserved")).toBeVisible();
    await expect(page.getByText("Merged error: Project name 'error' is reserved")).toBeVisible();

    await page.getByPlaceholder("Project name").fill("Quick E2E");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Optimistic project: Quick E2E (sending...)")).toBeVisible();
    await expect(page.getByText("Action data project: Quick E2E")).toBeVisible();
    await expect(page.getByText("Merged data project: Quick E2E")).toBeVisible();
  });

  test("exposes pending state and useFormStatus during slow actions", async ({ page }) => {
    await page.goto("/features/status-pending");

    await expect(page.getByRole("heading", { name: "Status Demo" })).toBeVisible();
    await expect(page.getByText("Status: idle")).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder("Describe this save").fill("Slow E2E save");
    await page.getByRole("button", { name: "Submit slow action" }).click();

    await expect(page.getByRole("button", { name: "Submitting..." })).toBeVisible();
    await expect(page.getByText("useFormStatus pending: yes")).toBeVisible();
    await expect(page.getByText("useFormStatus data: Slow E2E save")).toBeVisible();
    await expect(page.getByText("Last note: Slow E2E save")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("useFormStatus pending: no")).toBeVisible();
  });

  test("revalidates loader data after an action", async ({ page }) => {
    await page.goto("/features/revalidate");

    await expect(page.getByRole("heading", { name: "Revalidation Demo" })).toBeVisible();
    const initialCount = await page.getByText(/Count: \d+/).textContent();

    await page.getByRole("button", { name: "Increment and revalidate" }).click();

    await expect
      .poll(async () => page.getByText(/Count: \d+/).textContent())
      .not.toBe(initialCount);
    await expect(page.getByText("Status: idle")).toBeVisible();
  });

  test("follows action redirects with search state", async ({ page }) => {
    await page.goto("/features/redirect-action");

    await page.getByRole("button", { name: "Submit redirect action" }).click();

    await expect(page).toHaveURL("/features/redirect-target?from=action-form&mode=push");
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
    await expect(page.getByText("Redirect source: action-form")).toBeVisible();
    await expect(page.getByText("History mode: push")).toBeVisible();
  });
});
