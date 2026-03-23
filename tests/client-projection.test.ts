import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClientModuleProjection } from "../src/client-projection";

describe("client projection", () => {
  test("strips shorthand middleware references from client output", () => {
    const source = `
import { defineRoute, server } from "litz";

const auditMiddleware = [function requireSession() {
  return "server-secret";
}];

const loader = server(async () => {
  return { kind: "data", data: { ok: true } };
});

export const route = defineRoute("/", {
  component: HomePage,
  loader,
  middleware: auditMiddleware,
});

function HomePage() {
  return <main>Home</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/home.tsx", source);

    expect(projected).toContain("loader: __litz_server_placeholder__");
    expect(projected).toContain("middleware: []");
    expect(projected).not.toContain("requireSession");
    expect(projected).not.toContain("server-secret");
  });

  test("strips shorthand middleware properties as well", () => {
    const source = `
import { defineRoute } from "litz";

const middleware = [function requireAuth() {
  return "never ship this";
}];

export const route = defineRoute("/", {
  component: HomePage,
  middleware,
});

function HomePage() {
  return <main>Home</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/home.tsx", source);

    expect(projected).toContain("middleware: []");
    expect(projected).not.toContain("requireAuth");
    expect(projected).not.toContain("never ship this");
  });

  test("keeps imported layout bindings named layout when projection resolves real files", () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "litz-client-projection-"));
    const layoutFile = join(fixtureDir, "layout.tsx");
    const routeFile = join(fixtureDir, "route.tsx");

    try {
      writeFileSync(
        layoutFile,
        `
import { defineLayout } from "litz";

export const layout = defineLayout("/shell", {
  component: Shell,
});

function Shell({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
`,
      );

      writeFileSync(
        routeFile,
        `
import { defineRoute } from "litz";
import { layout } from "./layout";

function Page() {
  return <main>Page</main>;
}

export const route = defineRoute("/", {
  component: Page,
  layout: layout,
});
`,
      );

      const projected = createClientModuleProjection(routeFile, readFileSync(routeFile, "utf8"));

      expect(projected).toContain('import { layout } from "./layout";');
      expect(projected).toContain("layout: layout");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
