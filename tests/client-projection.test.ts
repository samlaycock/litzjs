import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

import {
  createClientModuleProjection,
  createServerModuleProjection,
} from "../src/client-projection";

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

  test("parses JSX route modules with JSX syntax", () => {
    const source = `
import { defineRoute } from "litzjs";

function Page() {
  return <main><h1>Home</h1></main>;
}

export const route = defineRoute("/", {
  component: Page,
});
`;

    const projected = createClientModuleProjection("/virtual/routes/home.jsx", source);

    expect(projected).toContain("<h1>Home</h1>");
    expect(projected).not.toContain("< /h1>");
  });

  test.each([
    ["defineRoute", "route"],
    ["defineLayout", "layout"],
    ["defineResource", "resource"],
  ])(
    "strips server-only input parsers and their dependencies from %s client output",
    (factory, exportName) => {
      const source = `
import { ${factory}, data, server } from "litzjs";
import { verify } from "./auth.server";

const SECRET = "INPUT_CANARY";

export const ${exportName} = ${factory}("/x", {
  component: Page,
  input: {
    headers(headers) {
      return verify(headers.get("token"), SECRET);
    },
  },
  loader: server(async () => data("ok")),
});

function Page() {
  return <main>Page</main>;
}
`;

      const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

      expect(projected).toContain(`${factory}("/x"`);
      expect(projected).toContain("component: Page");
      expect(projected).not.toContain("input");
      expect(projected).not.toContain("verify");
      expect(projected).not.toContain("auth.server");
      expect(projected).not.toContain("INPUT_CANARY");
    },
  );

  test("strips shorthand input properties from client output", () => {
    const source = `
import { defineRoute } from "litzjs";
import { parseHeaders } from "./input.server";

const input = {
  headers: (headers) => parseHeaders(headers, "SHORTHAND_INPUT_CANARY"),
};

export const route = defineRoute("/", {
  component: Page,
  input,
});

function Page() {
  return <main>Page</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/home.tsx", source);

    expect(projected).toContain("component: Page");
    expect(projected).not.toContain("parseHeaders");
    expect(projected).not.toContain("input.server");
    expect(projected).not.toContain("SHORTHAND_INPUT_CANARY");
  });

  test("strips method input properties from client output", () => {
    const source = `
import { defineLayout } from "litzjs";

export const layout = defineLayout("/", {
  component: Shell,
  input() {
    return "METHOD_INPUT_CANARY";
  },
});

function Shell() {
  return <main>Shell</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/shell.tsx", source);

    expect(projected).toContain("component: Shell");
    expect(projected).not.toContain("METHOD_INPUT_CANARY");
  });

  test("strips API route input parsers from client output", () => {
    const source = `
import { defineApiRoute } from "litzjs";
import { verify } from "./auth.server";

export const api = defineApiRoute("/api/x", {
  input: {
    headers: (headers) => verify(headers.get("token"), "API_INPUT_CANARY"),
  },
  GET() {
    return Response.json({ ok: true });
  },
});
`;

    const projected = createClientModuleProjection("/virtual/routes/api/x.ts", source);

    expect(projected).toContain("input: __litz_server_placeholder__");
    expect(projected).not.toContain("verify");
    expect(projected).not.toContain("auth.server");
    expect(projected).not.toContain("API_INPUT_CANARY");
  });

  test.each(['["input"]', "[`input`]", "'input'"])(
    "strips %s static input keys from client output",
    (key) => {
      const source = `
import { defineRoute } from "litzjs";
import { verify } from "./auth.server";

const SECRET = "COMPUTED_INPUT_CANARY";

export const route = defineRoute("/x", {
  component: Page,
  ${key}: {
    headers: () => verify(SECRET),
  },
});

function Page() {
  return <main>Page</main>;
}
`;

      const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

      expect(projected).toContain("component: Page");
      expect(projected).not.toContain("verify");
      expect(projected).not.toContain("auth.server");
      expect(projected).not.toContain("COMPUTED_INPUT_CANARY");
    },
  );

  test("replaces static computed loader keys with placeholders", () => {
    const source = `
import { defineRoute, data } from "litzjs";

const SECRET = "COMPUTED_LOADER_CANARY";

export const route = defineRoute("/x", {
  component: Page,
  ["loader"]: async () => data(SECRET),
});

function Page() {
  return <main>Page</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain('["loader"]: __litz_server_placeholder__');
    expect(projected).not.toContain("COMPUTED_LOADER_CANARY");
  });

  test.each([
    ["spread properties", "...options,"],
    ["dynamic computed keys", "[inputKey]: options.input,"],
    ["getter accessors", "get input() { return options.input; },"],
  ])("rejects route definitions with %s", (_label, property) => {
    const source = `
import { defineRoute } from "litzjs";

const inputKey = "input";
const options = {
  input: { headers: () => "INDIRECT_INPUT_CANARY" },
};

export const route = defineRoute("/x", {
  component: Page,
  ${property}
});

function Page() {
  return <main>Page</main>;
}
`;

    expect(() => createClientModuleProjection("/virtual/routes/x.tsx", source)).toThrow(
      'Litz cannot safely project defineRoute("/x") in /virtual/routes/x.tsx',
    );
  });
});

describe("server projection", () => {
  test("strips route component code from server output", () => {
    const source = `
import { Link, defineRoute, server } from "litzjs";

const loader = server(async () => {
  return { kind: "data", data: { ok: true } };
});

export const route = defineRoute("/", {
  component: HomePage,
  loader,
});

function HomePage() {
  return <Link href="/client-only">Client-only component code</Link>;
}
`;

    const projected = createServerModuleProjection("/virtual/routes/home.tsx", source);

    expect(projected).toContain("loader");
    expect(projected).toContain("server(async");
    expect(projected).not.toContain("HomePage");
    expect(projected).not.toContain("Client-only component code");
    expect(projected).not.toContain("Link");
  });

  test("keeps non-route component object references in server output", () => {
    const source = `
import { defineRoute } from "litzjs";
import { Widget } from "./widget";

const uiConfig = {
  component: Widget,
};

export const route = defineRoute("/", {
  component: HomePage,
  loader: () => uiConfig.component.name,
});

function HomePage() {
  return <main>Home</main>;
}
`;

    const projected = createServerModuleProjection("/virtual/routes/home.tsx", source);

    expect(projected).toContain('import { Widget } from "./widget";');
    expect(projected).toContain("component: Widget");
    expect(projected).toContain("uiConfig.component.name");
    expect(projected).not.toContain("HomePage");
  });

  test("parses JSX route modules with JSX syntax", () => {
    const source = `
import { defineRoute } from "litzjs";

const metadata = {
  title: <span>Home</span>,
};

export const route = defineRoute("/", {
  loader: () => metadata.title,
});
`;

    const projected = createServerModuleProjection("/virtual/routes/home.jsx", source);

    expect(projected).toContain("<span>Home</span>");
    expect(projected).not.toContain("< /span>");
  });
});
