import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readDoc(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function normalizeWhitespace(value: string) {
  return value.replaceAll(/\s+/g, " ").trim();
}

describe("docs package names", () => {
  test("installation docs use the published package name in every install command", () => {
    const installationDoc = readDoc("www/src/routes/docs/installation.tsx");

    expect(installationDoc).toContain("bun add litzjs");
    expect(installationDoc).toContain("npm install litzjs");
    expect(installationDoc).toContain("yarn add litzjs");
    expect(installationDoc).toContain("pnpm add litzjs");

    expect(installationDoc).not.toMatch(/bun add litz(?!js)/);
    expect(installationDoc).not.toMatch(/npm install litz(?!js)/);
    expect(installationDoc).not.toMatch(/yarn add litz(?!js)/);
    expect(installationDoc).not.toMatch(/pnpm add litz(?!js)/);
  });

  test("deployment and API reference docs use the published package name", () => {
    const denoDeployDoc = readDoc("www/src/routes/docs/deno-deploy.tsx");
    const apiReferenceDoc = normalizeWhitespace(readDoc("www/src/routes/docs/api-reference.tsx"));

    expect(denoDeployDoc).toContain('"litzjs/": "npm:litzjs@latest/"');
    expect(denoDeployDoc).not.toContain('"litzjs/": "npm:litz@latest/"');

    expect(apiReferenceDoc).toContain(
      "Complete reference for all exports from litzjs, litzjs/client, litzjs/server, and litzjs/vite.",
    );
    expect(apiReferenceDoc).toContain(">litzjs</h2>");
    expect(apiReferenceDoc).not.toContain("exports from litz, litzjs/client");
  });
});
