import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readDoc(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function normalizeWhitespace(value: string) {
  return value.replaceAll(/\s+/g, " ").trim();
}

describe("troubleshooting docs", () => {
  test("organize symptom-driven fixes around concrete failure signatures", () => {
    const troubleshootingDoc = normalizeWhitespace(
      readDoc("www/src/routes/docs/troubleshooting.tsx"),
    );

    expect(troubleshootingDoc).toContain("Start with the symptom you can already observe.");
    expect(troubleshootingDoc).toContain('Cannot find package "litzjs"');
    expect(troubleshootingDoc).toContain('Cannot find package "litz"');
    expect(troubleshootingDoc).toContain('Cannot resolve import "litzjs/server"');
    expect(troubleshootingDoc).toContain('Cannot resolve import "litzjs/client"');
    expect(troubleshootingDoc).toContain("Route not found.");
    expect(troubleshootingDoc).toContain("Route target not found.");
    expect(troubleshootingDoc).toContain("Resource not found.");
    expect(troubleshootingDoc).toContain('"/_litzjs/route"');
    expect(troubleshootingDoc).toContain('"/_litzjs/action"');
    expect(troubleshootingDoc).toContain('"/_litzjs/resource"');
    expect(troubleshootingDoc).toContain("server(async");
    expect(troubleshootingDoc).toContain('import { createServer } from "litzjs/server";');
    expect(troubleshootingDoc).toContain(".output/public");
    expect(troubleshootingDoc).toContain(".output/server/index.mjs");
    expect(troubleshootingDoc).not.toContain("embedAssets");
    expect(troubleshootingDoc).toContain('Link href="/docs/installation"');
    expect(troubleshootingDoc).toContain('Link href="/docs/configuration"');
    expect(troubleshootingDoc).toContain('Link href="/docs/routing"');
    expect(troubleshootingDoc).toContain('Link href="/docs/loaders-and-actions"');
    expect(troubleshootingDoc).toContain('Link href="/docs/server-configuration"');
    expect(troubleshootingDoc).toContain('Link href="/docs/forms"');
    expect(troubleshootingDoc).toContain('Link href="/docs/bun"');
    expect(troubleshootingDoc).toContain('Link href="/docs/node"');
    expect(troubleshootingDoc).toContain('Link href="/docs/cloudflare-workers"');
    expect(troubleshootingDoc).toContain('Link href="/docs/deno-deploy"');

    expect(troubleshootingDoc).not.toContain("Try simplifying your code to isolate the issue");
    expect(troubleshootingDoc).not.toContain("Sometimes needed after adding new routes");
    expect(troubleshootingDoc).not.toContain("Check the browser console for runtime errors");
  });
});
