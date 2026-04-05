import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readDoc(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
    .replaceAll(/\s+/g, " ")
    .trim();
}

describe("deployment docs", () => {
  test("document production-ready runtime recipes", () => {
    const nodeDoc = readDoc("www/src/routes/docs/node.tsx");
    const bunDoc = readDoc("www/src/routes/docs/bun.tsx");
    const cloudflareDoc = readDoc("www/src/routes/docs/cloudflare-workers.tsx");
    const denoDoc = readDoc("www/src/routes/docs/deno-deploy.tsx");

    expect(nodeDoc).toContain('import app from "./.output/server/index.mjs";');
    expect(nodeDoc).toContain("Readable.toWeb");
    expect(nodeDoc).toContain('express.static(path.join(clientDir, "assets")');
    expect(nodeDoc).toContain("reply.hijack()");
    expect(nodeDoc).toContain("request.log.error(error);");
    expect(nodeDoc).toContain('reply.raw.end("Internal Server Error");');
    expect(nodeDoc).toContain('const isStaticFile = pathname.startsWith("/assets/");');
    expect(nodeDoc).toContain("await pipeline(createReadStream");
    expect(nodeDoc).toContain("res.writableEnded || res.destroyed");
    expect(nodeDoc).not.toContain("embedAssets");

    expect(bunDoc).toContain('import app from "./.output/server/index.mjs";');
    expect(bunDoc).toContain("await asset.exists()");
    expect(bunDoc).toContain('headers.set("content-length", String(asset.size));');
    expect(bunDoc).toContain('headers.set("content-type", asset.type);');
    expect(bunDoc).toContain('url.pathname === "/" ? "/index.html" : url.pathname');
    expect(bunDoc).toContain(".output/public");
    expect(bunDoc).not.toContain("embedAssets");

    expect(cloudflareDoc).toContain("return app.fetch(request);");
    expect(cloudflareDoc).toContain('"run_worker_first": ["/_litzjs/*", "/api/*"]');
    expect(cloudflareDoc).toContain('"directory": "./.output/public"');
    expect(cloudflareDoc).toContain("env.ASSETS.fetch(request)");

    expect(denoDoc).toContain('import app from "./.output/server/index.mjs";');
    expect(denoDoc).toContain("satisfies Deno.ServeDefaultExport");
    expect(denoDoc).toContain("--include=.output/public");
    expect(denoDoc).toContain(".output/server/index.mjs");
    expect(denoDoc).not.toContain("embedAssets");
    expect(denoDoc).toContain("# Local preview");
    expect(denoDoc).toContain("# Production deploy");
    expect(denoDoc).toContain('"start": "vite build && deno serve ./server.ts"');
    expect(denoDoc).toContain("deployctl deploy");
  });
});
