import { describe, expect, test } from "bun:test";

import { createClientModuleProjection } from "../src/client-projection";

describe("client projection", () => {
  test("strips shorthand middleware references from client output", () => {
    const source = `
import { defineRoute, server } from "volt";

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

    expect(projected).toContain("loader: __volt_server_placeholder__");
    expect(projected).toContain("middleware: []");
    expect(projected).not.toContain("requireSession");
    expect(projected).not.toContain("server-secret");
  });

  test("strips shorthand middleware properties as well", () => {
    const source = `
import { defineRoute } from "volt";

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
});
