import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { discoverServerEntry, transformServerModuleSource } from "../src/vite";

describe("vite production server helpers", () => {
  test("prefers src/server.ts when auto-discovering a custom server entry", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-server-entry-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      mkdirSync(path.join(root, "src", "server"), { recursive: true });
      writeFileSync(path.join(root, "src", "server.ts"), "export default null;\n", "utf8");
      writeFileSync(path.join(root, "src", "server", "index.ts"), "export default null;\n", "utf8");

      expect(discoverServerEntry(root)).resolves.toBe("src/server.ts");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("falls back to src/server/index.ts when src/server.ts is absent", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-server-entry-"));

    try {
      mkdirSync(path.join(root, "src", "server"), { recursive: true });
      writeFileSync(path.join(root, "src", "server", "index.ts"), "export default null;\n", "utf8");

      expect(discoverServerEntry(root)).resolves.toBe("src/server/index.ts");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("rewrites bundled export lists into a local server handler binding", () => {
    const transformed = transformServerModuleSource(`
const helper = 1;
const server_default = createServer();
export { helper, server_default as default };
`);

    expect(transformed.source).toContain("export { helper };");
    expect(transformed.source).toContain("const __litzjsServerHandler = server_default;");
    expect(transformed.source).not.toContain("server_default as default");
    expect(transformed.handlerName).toBe("__litzjsServerHandler");
  });

  test("rewrites export default expressions into a local server handler binding", () => {
    const transformed = transformServerModuleSource(`
const helper = 1;
export default createServer({ helper });
`);

    expect(transformed.source).toContain("const __litzjsServerHandler = createServer({ helper });");
    expect(transformed.source).not.toContain("export default createServer");
    expect(transformed.handlerName).toBe("__litzjsServerHandler");
  });
});
