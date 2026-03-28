import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readDoc(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function normalizeWhitespace(value: string) {
  return value.replaceAll(/\s+/g, " ").trim();
}

describe("getting started docs flow", () => {
  test("guides readers through installation, first app, quick start, then configuration", () => {
    const rootLayout = normalizeWhitespace(readDoc("www/src/routes/_layouts/root.tsx"));
    const installationDoc = normalizeWhitespace(readDoc("www/src/routes/docs/installation.tsx"));
    const firstAppDoc = normalizeWhitespace(readDoc("www/src/routes/docs/first-app.tsx"));
    const quickStartDoc = normalizeWhitespace(readDoc("www/src/routes/docs/quick-start.tsx"));
    const configurationDoc = normalizeWhitespace(readDoc("www/src/routes/docs/configuration.tsx"));

    expect(rootLayout).toContain('{ title: "Introduction", path: "/docs" },');
    expect(rootLayout).toContain('{ title: "Installation", path: "/docs/installation" },');
    expect(rootLayout).toContain('{ title: "First App", path: "/docs/first-app" },');
    expect(rootLayout).toContain('{ title: "Quick Start", path: "/docs/quick-start" },');
    expect(rootLayout).toContain('{ title: "Configuration", path: "/docs/configuration" },');
    expect(
      rootLayout.indexOf('{ title: "Installation", path: "/docs/installation" },'),
    ).toBeLessThan(rootLayout.indexOf('{ title: "First App", path: "/docs/first-app" },'));
    expect(rootLayout.indexOf('{ title: "First App", path: "/docs/first-app" },')).toBeLessThan(
      rootLayout.indexOf('{ title: "Quick Start", path: "/docs/quick-start" },'),
    );
    expect(rootLayout.indexOf('{ title: "Quick Start", path: "/docs/quick-start" },')).toBeLessThan(
      rootLayout.indexOf('{ title: "Configuration", path: "/docs/configuration" },'),
    );

    expect(installationDoc).toContain('Link href="/docs/first-app"');
    expect(installationDoc).toContain("First App");
    expect(installationDoc).not.toContain('Link href="/docs/quick-start"');
    expect(firstAppDoc).toContain('defineRoute("/docs/first-app"');
    expect(firstAppDoc).toContain("mkdir hello-litz");
    expect(firstAppDoc).toContain("bun add litzjs react react-dom");
    expect(firstAppDoc).toContain('import { litz } from "litzjs/vite";');
    expect(firstAppDoc).toContain(
      'Open <code className="text-sky-400">http://localhost:5173</code>.',
    );
    expect(firstAppDoc).toContain('Link href="/docs/quick-start"');
    expect(quickStartDoc).toContain('Link href="/docs/configuration"');
    expect(quickStartDoc).toContain('Link href="/docs/first-app"');
    expect(quickStartDoc).toContain("Configuration &rarr;");
    expect(quickStartDoc).not.toContain('Link href="/docs/routing"');
    expect(configurationDoc).toContain('Link href="/docs/quick-start"');
    expect(configurationDoc).toContain("&larr; Quick Start");
  });
});

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

    expect(installationDoc).toContain("bun add react react-dom");
    expect(installationDoc).toContain("npm install react react-dom");
    expect(installationDoc).toContain("yarn add react react-dom");
    expect(installationDoc).toContain("pnpm add react react-dom");

    expect(installationDoc).toContain("bun add -d typescript vite @vitejs/plugin-rsc");
    expect(installationDoc).toContain("npm install -D typescript vite @vitejs/plugin-rsc");
    expect(installationDoc).toContain("yarn add -D typescript vite @vitejs/plugin-rsc");
    expect(installationDoc).toContain("pnpm add -D typescript vite @vitejs/plugin-rsc");

    expect(installationDoc).toContain("Compatibility matrix");
    expect(installationDoc).toContain('packageName: "react"');
    expect(installationDoc).toContain('packageName: "react-dom"');
    expect(installationDoc).toContain('packageName: "typescript"');
    expect(installationDoc).toContain('packageName: "vite"');
    expect(installationDoc).toContain('packageName: "@vitejs/plugin-rsc"');
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
