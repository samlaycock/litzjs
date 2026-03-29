import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

import { createClientModuleProjection } from "../src/client-projection";

describe("client projection", () => {
  test("strips shorthand middleware references from client output", () => {
    const source = `
import { defineRoute, server } from "litzjs";

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
import { defineRoute } from "litzjs";

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

  test("does not pull in shadowed top-level declarations", () => {
    const source = `
import { defineRoute } from "litzjs";

const layout = {
  secret: "server-only",
};

function Page() {
  const layout = "client-layout";

  return <main>{layout}</main>;
}

export const route = defineRoute("/", {
  component: Page,
});
`;

    const projected = createClientModuleProjection("/virtual/routes/home.tsx", source);

    expect(projected).toContain('const layout = "client-layout";');
    expect(projected).not.toContain("server-only");
  });

  test("keeps top-level values when matching imports are type-only", () => {
    const source = `
import type { layout } from "./layout-types";
import { defineRoute } from "litzjs";

const layout = defineRoute("/shell", {
  component: Shell,
});

function Shell() {
  return <section>Shell</section>;
}

function Page() {
  return <main>Page</main>;
}

export const route = defineRoute("/", {
  component: Page,
  layout,
});
`;

    const projected = createClientModuleProjection("/virtual/routes/home.tsx", source);

    expect(projected).toContain("const layout = defineRoute");
    expect(projected).not.toContain('import { layout } from "./layout-types";');
  });

  test("ignores inline type-only named imports when tracking value bindings", () => {
    const source = `
import { defineRoute, type layout } from "litzjs";

const layout = defineRoute("/shell", {
  component: Shell,
});

function Shell() {
  return <section>Shell</section>;
}

function Page() {
  return <main>Page</main>;
}

export const route = defineRoute("/", {
  component: Page,
  layout,
});
`;

    const projected = createClientModuleProjection("/virtual/routes/home.tsx", source);

    expect(projected).toContain("const layout = defineRoute");
    expect(projected).not.toContain("type layout");
  });

  test("keeps imported layout bindings named layout when projection resolves real files", () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "litz-client-projection-"));
    const layoutFile = join(fixtureDir, "layout.tsx");
    const routeFile = join(fixtureDir, "route.tsx");

    try {
      writeFileSync(
        layoutFile,
        `
import { defineLayout } from "litzjs";

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
import { defineRoute } from "litzjs";
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

  test("does not create a TypeScript program for each projection", async () => {
    const source = `
import { defineRoute } from "litzjs";

function Page() {
  return <main>Home</main>;
}

export const route = defineRoute("/", {
  component: Page,
});
`;
    const createProgram = mock((...args: Parameters<typeof ts.createProgram>) => {
      throw new Error(
        `createProgram should not be called: ${args[0]?.join(",") ?? "unknown root names"}`,
      );
    });

    await mock.module("typescript", () => ({
      default: {
        ...ts,
        createProgram,
      },
    }));

    try {
      const { createClientModuleProjection: createProjectionWithoutProgram } = await import(
        `../src/client-projection.ts?without-program=${Date.now()}`
      );

      createProjectionWithoutProgram("/virtual/routes/home.tsx", source);

      expect(createProgram).not.toHaveBeenCalled();
    } finally {
      mock.restore();
    }
  });

  test("appends a hot accept handler for projected route modules", () => {
    const source = `
import { defineRoute } from "litzjs";

function Page() {
  return <main>Home</main>;
}

export const route = defineRoute("/", {
  component: Page,
});
`;

    const projected = createClientModuleProjection("/virtual/routes/home.tsx", source);

    expect(projected).toContain("import.meta.hot.accept((mod) =>");
    expect(projected).toContain('kind: "route"');
    expect(projected).toContain("definition: mod.route");
  });
});
