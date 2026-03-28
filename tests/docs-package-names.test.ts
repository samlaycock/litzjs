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

  test("installation docs list the full peer dependency surface and compatibility matrix", () => {
    const installationDoc = normalizeWhitespace(readDoc("www/src/routes/docs/installation.tsx"));

    expect(installationDoc).toContain("bun add -d typescript vite @vitejs/plugin-rsc");
    expect(installationDoc).toContain("npm install -D typescript vite @vitejs/plugin-rsc");
    expect(installationDoc).toContain("yarn add -D typescript vite @vitejs/plugin-rsc");
    expect(installationDoc).toContain("pnpm add -D typescript vite @vitejs/plugin-rsc");

    expect(installationDoc).toContain("Compatibility matrix");
    expect(installationDoc).toContain("react</code>");
    expect(installationDoc).toContain("react-dom</code>");
    expect(installationDoc).toContain("typescript</code>");
    expect(installationDoc).toContain("vite</code>");
    expect(installationDoc).toContain("@vitejs/plugin-rsc</code>");
    expect(installationDoc).toContain("^19");
    expect(installationDoc).toContain("^6.0.2");
    expect(installationDoc).toContain("^8");
    expect(installationDoc).toContain("^0.5.21");
    expect(installationDoc).toContain("Runtime compatibility notes");
    expect(installationDoc).toContain("does not publish a single runtime engine floor");
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

  test("docs navigation copy and header links use the published package and repository names", () => {
    const siteMetadata = readDoc("www/src/site-metadata.ts");
    const rootLayout = readDoc("www/src/routes/_layouts/root.tsx");
    const navigationDoc = normalizeWhitespace(readDoc("www/src/routes/docs/navigation.tsx"));

    expect(siteMetadata).toContain('githubRepositoryUrl: "https://github.com/samlaycock/litzjs"');
    expect(siteMetadata).not.toMatch(/https:\/\/github\.com\/samlaycock\/litz(?!js)/);

    expect(rootLayout).toContain("href={siteMetadata.githubRepositoryUrl}");
    expect(rootLayout).toContain("href={siteMetadata.npmPackageUrl}");
    expect(rootLayout).not.toMatch(/https:\/\/github\.com\/samlaycock\/litz(?!js)/);

    expect(navigationDoc).toContain('Import from <code className="text-sky-400">"litzjs"</code>.');
    expect(navigationDoc).toContain(
      'Import from <code className="text-sky-400">"litzjs/client"</code>. Returns a function',
    );
    expect(navigationDoc).not.toContain(
      'Import from <code className="text-sky-400">"litz"</code>.',
    );
  });
});
