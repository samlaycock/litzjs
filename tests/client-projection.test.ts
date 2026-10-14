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

describe("client projection of aliased and namespace Litz imports", () => {
  test("strips loaders and actions from aliased factory and server imports", () => {
    const source = `
import { defineRoute as make, server as mark, data } from "litzjs";

const SECRET = "ALIAS_LOADER_CANARY";

export const route = make("/x", {
  component: Page,
  input: { search: () => "ALIAS_INPUT_CANARY" },
  middleware: [() => "ALIAS_MIDDLEWARE_CANARY"],
  loader: mark(() => data(SECRET)),
  action: mark(() => data("ALIAS_ACTION_CANARY")),
});

function Page() {
  return <main>Page</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain("loader: __litz_server_placeholder__");
    expect(projected).toContain("action: __litz_server_placeholder__");
    expect(projected).toContain("middleware: []");
    expect(projected).toContain("const __litz_server_placeholder__ = {}");
    expect(projected).toContain('import { defineRoute as make } from "litzjs";');
    expect(projected).not.toContain("ALIAS_LOADER_CANARY");
    expect(projected).not.toContain("ALIAS_INPUT_CANARY");
    expect(projected).not.toContain("ALIAS_MIDDLEWARE_CANARY");
    expect(projected).not.toContain("ALIAS_ACTION_CANARY");
    expect(projected).not.toContain("mark");
  });

  test("strips loaders and actions from namespace-imported factories", () => {
    const source = `
import * as litz from "litzjs";

const SECRET = "NAMESPACE_LOADER_CANARY";

export const route = litz.defineRoute("/x", {
  component: Page,
  input: { search: () => "NAMESPACE_INPUT_CANARY" },
  middleware: [() => "NAMESPACE_MIDDLEWARE_CANARY"],
  loader: litz.server(() => litz.data(SECRET)),
  action: litz.server(() => litz.data("NAMESPACE_ACTION_CANARY")),
});

function Page() {
  return <main>Page</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain("loader: __litz_server_placeholder__");
    expect(projected).toContain("action: __litz_server_placeholder__");
    expect(projected).toContain("middleware: []");
    expect(projected).toContain("const __litz_server_placeholder__ = {}");
    expect(projected).not.toContain("NAMESPACE_LOADER_CANARY");
    expect(projected).not.toContain("NAMESPACE_INPUT_CANARY");
    expect(projected).not.toContain("NAMESPACE_MIDDLEWARE_CANARY");
    expect(projected).not.toContain("NAMESPACE_ACTION_CANARY");
  });

  test("strips standalone server handlers referenced through aliases and namespaces", () => {
    const source = `
import * as litz from "litzjs";
import { server as mark } from "litzjs";
import { loadSecret } from "./secret.server";

const loader = litz.server(() => litz.data(loadSecret()));
const action = mark(() => litz.data("STANDALONE_ACTION_CANARY"));

export const resource = litz.defineResource("/resource/x", {
  component: Card,
  loader,
  action,
});

function Card() {
  return <section>Card</section>;
}
`;

    const projected = createClientModuleProjection("/virtual/resources/x.tsx", source);

    expect(projected).toContain("loader: __litz_server_placeholder__");
    expect(projected).toContain("action: __litz_server_placeholder__");
    expect(projected).not.toContain("loadSecret");
    expect(projected).not.toContain("secret.server");
    expect(projected).not.toContain("STANDALONE_ACTION_CANARY");
  });

  test("strips aliased and namespaced API route handlers", () => {
    const aliased = createClientModuleProjection(
      "/virtual/api/x.ts",
      `
import { defineApiRoute as api_ } from "litzjs";

export const api = api_("/api/x", {
  GET() {
    return Response.json({ secret: "ALIASED_API_CANARY" });
  },
});
`,
    );
    const namespaced = createClientModuleProjection(
      "/virtual/api/y.ts",
      `
import * as litz from "litzjs";

export const api = litz.defineApiRoute("/api/y", {
  POST: () => Response.json({ secret: "NAMESPACE_API_CANARY" }),
});
`,
    );

    expect(aliased).toContain("GET: __litz_server_placeholder__");
    expect(aliased).not.toContain("ALIASED_API_CANARY");
    expect(namespaced).toContain("POST: __litz_server_placeholder__");
    expect(namespaced).not.toContain("NAMESPACE_API_CANARY");
  });

  test("rejects aliased and namespaced definitions that cannot be statically projected", () => {
    expect(() =>
      createClientModuleProjection(
        "/virtual/routes/x.tsx",
        `
import { defineRoute as make } from "litzjs";

const options = { loader: () => "INDIRECT_CANARY" };

export const route = make("/x", { component: Page, ...options });

function Page() {
  return null;
}
`,
      ),
    ).toThrow('Litz cannot safely project make("/x") in /virtual/routes/x.tsx');
    expect(() =>
      createClientModuleProjection(
        "/virtual/routes/y.tsx",
        `
import * as litz from "litzjs";

const options = { loader: () => "INDIRECT_CANARY" };

export const route = litz.defineLayout("/y", { component: Page, ...options });

function Page() {
  return null;
}
`,
      ),
    ).toThrow('Litz cannot safely project litz.defineLayout("/y") in /virtual/routes/y.tsx');
  });

  test("does not strip local bindings that shadow aliased or namespace Litz imports", () => {
    const source = `
import { defineRoute, server as mark } from "litzjs";
import * as litz from "litzjs";

export const route = defineRoute("/x", {
  component: Page,
});

function Page() {
  const items = [1, 2].map((mark) => mark + 1);
  const label = ((litz) => litz.server("KEEP_NAMESPACE_CALL"))({ server: String });
  const format = (mark: (value: string) => string) => mark("KEEP_ALIAS_CALL");

  return <main>{items.join(",")}{label}{format(String)}</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain('litz.server("KEEP_NAMESPACE_CALL")');
    expect(projected).toContain('mark("KEEP_ALIAS_CALL")');
    expect(projected).not.toContain("__litz_server_placeholder__ = {}");
  });

  test.each([
    ["aliased", 'import { data, defineRoute as make } from "litzjs";', "make"],
    ["namespaced", 'import * as litz from "litzjs";\nconst { data } = litz;', "litz.defineRoute"],
    ["unaliased", 'import { data, defineRoute } from "litzjs";', "defineRoute"],
  ])(
    "declares the placeholder for plain %s loader and action handlers",
    (_label, imports, factory) => {
      const source = `
${imports}

export const route = ${factory}("/x", {
  component: Page,
  loader: () => data("PLAIN_LOADER_CANARY"),
  action: async () => data("PLAIN_ACTION_CANARY"),
});

function Page() {
  return <main>Page</main>;
}
`;

      const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

      expect(projected).toContain("const __litz_server_placeholder__ = {}");
      expect(projected).toContain("loader: __litz_server_placeholder__");
      expect(projected).toContain("action: __litz_server_placeholder__");
      expect(projected).not.toContain("PLAIN_LOADER_CANARY");
      expect(projected).not.toContain("PLAIN_ACTION_CANARY");
    },
  );

  test.each([
    ["aliased", 'import { data, defineRoute as make } from "litzjs";', "make"],
    [
      "namespaced",
      'import * as litz from "litzjs";\nimport { data } from "litzjs";',
      "litz.defineResource",
    ],
    ["unaliased", 'import { data, defineRoute } from "litzjs";', "defineRoute"],
  ])("replaces %s method-style loader and action handlers", (_label, imports, factory) => {
    const source = `
${imports}
import { readSecret } from "./secret.server";

export const route = ${factory}("/x", {
  component: Page,
  loader() {
    return data(readSecret("METHOD_LOADER_CANARY"));
  },
  async action() {
    return data("METHOD_ACTION_CANARY");
  },
});

function Page() {
  return <main>Page</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain("const __litz_server_placeholder__ = {}");
    expect(projected).toContain("loader: __litz_server_placeholder__");
    expect(projected).toContain("action: __litz_server_placeholder__");
    expect(projected).not.toContain("METHOD_LOADER_CANARY");
    expect(projected).not.toContain("METHOD_ACTION_CANARY");
    expect(projected).not.toContain("readSecret");
  });

  test("does not treat same-named imports from other modules as Litz factories", () => {
    const source = `
import { defineRoute } from "litzjs";
import { server as mark } from "./not-litz";

const helper = mark(() => "KEEP_THIS_HELPER");

export const route = defineRoute("/x", {
  component: Page,
});

function Page() {
  return <main>{String(helper)}</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain("KEEP_THIS_HELPER");
    expect(projected).toContain('import { server as mark } from "./not-litz";');
    expect(projected).not.toContain("__litz_server_placeholder__ = {}");
  });
});

describe("client projection of export clauses", () => {
  test("strips server code from definitions exported through renamed export clauses", () => {
    const source = `
import { data, defineRoute, server } from "litzjs";

const r = defineRoute("/x", {
  component: Page,
  loader: server(() => data("EXPORT_CANARY")),
});

function Page() {
  return <main>Export clause</main>;
}

export { r as route };
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).not.toBeNull();
    expect(projected).toContain("loader: __litz_server_placeholder__");
    expect(projected).toContain("export { r as route };");
    expect(projected).toContain("definition: mod.route");
    expect(projected).not.toContain("EXPORT_CANARY");
  });

  test.each([
    ["route", "defineRoute", "/x"],
    ["layout", "defineLayout", "/x"],
    ["resource", "defineResource", "/resource/x"],
  ])(
    "strips server code from %s definitions exported through plain export clauses",
    (exportName, factory, path) => {
      const source = `
import { data, ${factory}, server } from "litzjs";

const ${exportName} = ${factory}("${path}", {
  component: Page,
  loader: server(() => data("EXPORT_CANARY")),
});

function Page() {
  return <main>Export clause</main>;
}

export { ${exportName} };
`;

      const projected = createClientModuleProjection("/virtual/x.tsx", source);

      expect(projected).not.toBeNull();
      expect(projected).toContain("loader: __litz_server_placeholder__");
      expect(projected).toContain(`kind: "${exportName}"`);
      expect(projected).not.toContain("EXPORT_CANARY");
    },
  );

  test("strips API handlers exported through export clauses", () => {
    const source = `
import { defineApiRoute } from "litzjs";

const handlers = defineApiRoute("/api/x", {
  GET() {
    return Response.json({ secret: "EXPORT_CANARY" });
  },
});

export { handlers as api };
`;

    const projected = createClientModuleProjection("/virtual/api/x.ts", source);

    expect(projected).not.toBeNull();
    expect(projected).toContain("GET: __litz_server_placeholder__");
    expect(projected).not.toContain("EXPORT_CANARY");
  });

  test("only keeps the definition specifier from a shared export clause", () => {
    const source = `
import { defineRoute } from "litzjs";

const secretHelper = () => "HELPER_CANARY";
const r = defineRoute("/x", {
  component: Page,
});

function Page() {
  return <main>Export clause</main>;
}

export { secretHelper, r as route };
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain("export { r as route };");
    expect(projected).not.toContain("secretHelper");
    expect(projected).not.toContain("HELPER_CANARY");
  });

  test("does not pull in a local declaration that only shares the exported name", () => {
    const source = `
import { defineRoute } from "litzjs";

const route = "UNRELATED_LOCAL_CANARY";
const r = defineRoute("/x", {
  component: Page,
});

function Page() {
  return <main>Export clause</main>;
}

export { r as route };
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain("export { r as route };");
    expect(projected).not.toContain("UNRELATED_LOCAL_CANARY");
  });

  test("ignores type-only export clauses", () => {
    const source = `
import { defineRoute } from "litzjs";

type r = { secret: "TYPE_CANARY" };

export type { r as route };
`;

    expect(createClientModuleProjection("/virtual/routes/x.tsx", source)).toBeNull();
  });

  test("projects definitions that are not the first declaration in an exported statement", () => {
    const source = `
import { data, defineRoute, server } from "litzjs";

export const label = "x", route = defineRoute("/x", {
  component: Page,
  loader: server(() => data("EXPORT_CANARY")),
});

function Page() {
  return <main>{label}</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).not.toBeNull();
    expect(projected).toContain("loader: __litz_server_placeholder__");
    expect(projected).toContain("definition: mod.route");
    expect(projected).not.toContain("EXPORT_CANARY");
  });
  test("drops sibling declarations that only server handlers reference", () => {
    const source = `
import { data, defineRoute } from "litzjs";

export const secret = "PRIVATE_CANARY", label = "KEPT_LABEL", route = defineRoute("/x", {
  component: Page,
  loader: () => data(secret),
});

function Page() {
  return <main>{label}</main>;
}
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain("loader: __litz_server_placeholder__");
    expect(projected).toContain("KEPT_LABEL");
    expect(projected).not.toContain("PRIVATE_CANARY");
    expect(projected).not.toContain("secret");
  });

  test("keeps every definition exported from one module", () => {
    const source = `
import { data, defineResource, defineRoute, server } from "litzjs";

const r = defineRoute("/x", {
  component: Page,
  loader: server(() => data("ROUTE_CANARY")),
});
const res = defineResource("/resource/x", {
  component: Page,
  loader: server(() => data("RESOURCE_CANARY")),
});

function Page() {
  return <main>Shared</main>;
}

export { r as route, res as resource };
`;

    const projected = createClientModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain("export { r as route, res as resource };");
    expect(projected).toContain("definition: mod.route");
    expect(projected).toContain("definition: mod.resource");
    expect(projected).not.toContain("ROUTE_CANARY");
    expect(projected).not.toContain("RESOURCE_CANARY");
  });
});

describe("server projection", () => {
  test("keeps every definition and sibling export from export clauses", () => {
    const source = `
import { data, defineResource, defineRoute, server } from "litzjs";

const helper = () => "SERVER_HELPER";
const r = defineRoute("/x", {
  component: Page,
  loader: server(() => data(helper())),
});
const res = defineResource("/resource/x", {
  component: Page,
  loader: server(() => data("RESOURCE_LOADER")),
});

function Page() {
  return <main>Client-only page</main>;
}

export { helper, r as route, res as resource };
`;

    const projected = createServerModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain("export { helper, r as route, res as resource };");
    expect(projected).toContain("SERVER_HELPER");
    expect(projected).toContain("RESOURCE_LOADER");
    expect(projected).not.toContain("Client-only page");
  });

  test("keeps sibling declarations of exported definitions", () => {
    const source = `
import { defineRoute } from "litzjs";

export const label = "SERVER_LABEL", route = defineRoute("/x", {
  component: Page,
});

function Page() {
  return <main>Client-only page</main>;
}
`;

    const projected = createServerModuleProjection("/virtual/routes/x.tsx", source);

    expect(projected).toContain("SERVER_LABEL");
    expect(projected).not.toContain("Client-only page");
  });

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

  test("strips components from aliased and namespaced definitions", () => {
    const aliased = createServerModuleProjection(
      "/virtual/routes/x.tsx",
      `
import { defineRoute as make } from "litzjs";

export const route = make("/x", {
  component: function Page() {
    return <main>ALIASED_COMPONENT_CANARY</main>;
  },
});
`,
    );
    const namespaced = createServerModuleProjection(
      "/virtual/routes/y.tsx",
      `
import * as litz from "litzjs";

export const layout = litz.defineLayout("/y", {
  component: function Shell() {
    return <main>NAMESPACE_COMPONENT_CANARY</main>;
  },
});
`,
    );

    expect(aliased).not.toContain("ALIASED_COMPONENT_CANARY");
    expect(namespaced).not.toContain("NAMESPACE_COMPONENT_CANARY");
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
