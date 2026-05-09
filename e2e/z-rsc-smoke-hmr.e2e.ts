import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const accountMenuPath = resolve(
  process.cwd(),
  "fixtures/rsc-smoke/src/routes/resources/account-menu.tsx",
);

test.describe("smoke fixture HMR", () => {
  test("updates active resource UI through HMR", async ({ page }) => {
    const originalSource = await readFile(accountMenuPath, "utf8");
    const updatedSource = originalSource.replace("Account Menu", "Account Menu Updated By HMR");

    await page.goto("/features/resource-data");
    await expect(page.getByRole("heading", { name: "Account Menu" })).toBeVisible();
    await expect(page.getByText("Title: Summary for alpha")).toBeVisible();

    try {
      await writeFile(accountMenuPath, updatedSource);
      await expect(page.getByRole("heading", { name: "Account Menu Updated By HMR" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("Title: Summary for alpha")).toBeVisible();
    } finally {
      await writeFile(accountMenuPath, originalSource);
    }
  });
});
