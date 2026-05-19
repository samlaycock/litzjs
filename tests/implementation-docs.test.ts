import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";

import { readDoc } from "./helpers/read-doc";

const docs = [
  "docs/README.md",
  "docs/app-and-route-discovery.md",
  "docs/server-handlers.md",
  "docs/view-rsc-and-flight.md",
  "docs/vite-plugin-and-build.md",
  "docs/runtime-deployment-and-errors.md",
];

function readImplementationDocs() {
  return docs.map(readDoc).join("\n");
}

describe("implementation docs", () => {
  test("replace the stale project plan with focused implementation references", () => {
    expect(existsSync(path.join(process.cwd(), "PROJECT.md"))).toBe(false);

    for (const doc of docs) {
      expect(existsSync(path.join(process.cwd(), doc))).toBe(true);
    }

    const content = readImplementationDocs();

    expect(content).toContain("defineApp(...)");
    expect(content).toContain("defineLayout");
    expect(content).toContain("dist/server/index.mjs");
    expect(content).toContain("dist/client");
    expect(content).toContain("view(...)");
    expect(content).toContain("React Server Components");
  });

  test("do not reintroduce removed APIs or removed plugin options as current guidance", () => {
    const content = readImplementationDocs();

    expect(content).not.toContain("pendingComponent");
    expect(content).not.toContain("errorComponent");
    expect(content).not.toContain("routeGlob");
    expect(content).not.toContain("resourceGlob");
    expect(content).not.toContain("apiGlob");
    expect(content).not.toContain("routes?: string[]");
    expect(content).not.toContain("clientEntry");
  });
});
