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
    const docsNav = normalizeWhitespace(readDoc("www/src/components/docs-nav.ts"));
    const installationDoc = normalizeWhitespace(readDoc("www/src/routes/docs/installation.tsx"));
    const firstAppDoc = normalizeWhitespace(readDoc("www/src/routes/docs/first-app.tsx"));
    const quickStartDoc = normalizeWhitespace(readDoc("www/src/routes/docs/quick-start.tsx"));
    const configurationDoc = normalizeWhitespace(readDoc("www/src/routes/docs/configuration.tsx"));

    expect(docsNav).toContain('{ title: "Introduction", path: "/docs" },');
    expect(docsNav).toContain('{ title: "Installation", path: "/docs/installation" },');
    expect(docsNav).toContain('{ title: "First App", path: "/docs/first-app" },');
    expect(docsNav).toContain('{ title: "Quick Start", path: "/docs/quick-start" },');
    expect(docsNav).toContain('{ title: "Configuration", path: "/docs/configuration" },');
    expect(docsNav.indexOf('{ title: "Installation", path: "/docs/installation" },')).toBeLessThan(
      docsNav.indexOf('{ title: "First App", path: "/docs/first-app" },'),
    );
    expect(docsNav.indexOf('{ title: "First App", path: "/docs/first-app" },')).toBeLessThan(
      docsNav.indexOf('{ title: "Quick Start", path: "/docs/quick-start" },'),
    );
    expect(docsNav.indexOf('{ title: "Quick Start", path: "/docs/quick-start" },')).toBeLessThan(
      docsNav.indexOf('{ title: "Configuration", path: "/docs/configuration" },'),
    );

    expect(installationDoc).toContain('Link href="/docs/first-app"');
    expect(installationDoc).toContain("First App");
    expect(installationDoc).not.toContain('Link href="/docs/quick-start"');
    expect(firstAppDoc).toContain('defineRoute("/docs/first-app"');
    expect(firstAppDoc).toContain("mkdir hello-litz");
    expect(firstAppDoc).toContain("bun add litzjs react react-dom");
    expect(firstAppDoc).toContain("bun add -d typescript vite @types/react @types/react-dom");
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

  test("installation docs list the minimal peer dependency surface and bundled adapters", () => {
    const installationDoc = normalizeWhitespace(readDoc("www/src/routes/docs/installation.tsx"));

    expect(installationDoc).toContain("bun add react react-dom");
    expect(installationDoc).toContain("npm install react react-dom");
    expect(installationDoc).toContain("yarn add react react-dom");
    expect(installationDoc).toContain("pnpm add react react-dom");

    expect(installationDoc).toContain("bun add -d vite typescript");
    expect(installationDoc).toContain("npm install -D vite typescript");
    expect(installationDoc).toContain("yarn add -D vite typescript");
    expect(installationDoc).toContain("pnpm add -D vite typescript");
    expect(installationDoc).not.toContain("bun add -d nitro");
    expect(installationDoc).not.toContain("npm install -D nitro");
    expect(installationDoc).not.toContain("yarn add -D nitro");
    expect(installationDoc).not.toContain("pnpm add -D nitro");
    expect(installationDoc).not.toContain("bun add -d typescript vite @vitejs/plugin-rsc");
    expect(installationDoc).not.toContain("npm install -D typescript vite @vitejs/plugin-rsc");
    expect(installationDoc).not.toContain("yarn add -D typescript vite @vitejs/plugin-rsc");
    expect(installationDoc).not.toContain("pnpm add -D typescript vite @vitejs/plugin-rsc");

    expect(installationDoc).toContain("Compatibility matrix");
    expect(installationDoc).toContain('packageName: "react"');
    expect(installationDoc).toContain('packageName: "react-dom"');
    expect(installationDoc).toContain('packageName: "vite"');
    expect(installationDoc).not.toContain('packageName: "nitro"');
    expect(installationDoc).toContain("^19");
    expect(installationDoc).toContain("^8");
    expect(installationDoc).toContain("Included capabilities");
    expect(installationDoc).toContain("@vitejs/plugin-rsc");
    expect(installationDoc).toContain("is bundled with");
    expect(installationDoc).toContain("your app still needs its own TypeScript install");
    expect(installationDoc).toContain("editor integration");
    expect(installationDoc).toContain("local type-check scripts");
    expect(installationDoc).toContain("Runtime compatibility notes");
    expect(installationDoc).toContain("does not publish a single runtime engine floor");
  });

  test("getting started and troubleshooting docs do not ask apps to install bundled adapters", () => {
    const firstAppDoc = normalizeWhitespace(readDoc("www/src/routes/docs/first-app.tsx"));
    const troubleshootingDoc = normalizeWhitespace(
      readDoc("www/src/routes/docs/troubleshooting.tsx"),
    );

    expect(firstAppDoc).not.toContain("bun add -d nitro");
    expect(firstAppDoc).not.toContain("Install nitro only");
    expect(troubleshootingDoc).not.toContain("bun add -d typescript vite @vitejs/plugin-rsc");
    expect(troubleshootingDoc).toContain("bun add -d typescript vite");
  });

  test("configuration and API docs match current Vite defaults", () => {
    const readme = normalizeWhitespace(readDoc("README.md"));
    const configurationDoc = normalizeWhitespace(readDoc("www/src/routes/docs/configuration.tsx"));
    const apiReferenceDoc = normalizeWhitespace(readDoc("www/src/routes/docs/api-reference.tsx"));
    const troubleshootingDoc = normalizeWhitespace(
      readDoc("www/src/routes/docs/troubleshooting.tsx"),
    );

    for (const doc of [readme, configurationDoc, apiReferenceDoc, troubleshootingDoc]) {
      expect(doc).toContain("src/routes/**/*.{ts,tsx,js,jsx}");
    }

    expect(configurationDoc).toContain("clientEntry");
    expect(apiReferenceDoc).toContain("clientEntry?: string;");
    expect(apiReferenceDoc).toContain("rsc?: Omit<RscPluginOptions");
    expect(troubleshootingDoc).toContain('import app from "./dist/server/index.mjs";');
    expect(troubleshootingDoc).toContain('const clientDir = path.resolve("dist/public");');
    expect(troubleshootingDoc).not.toContain("dist/client");
    expect(troubleshootingDoc).not.toContain("dist/server/index.js");
  });

  test("package metadata keeps implementation dependencies out of the peer surface", () => {
    const packageJson = JSON.parse(readDoc("package.json")) as {
      readonly dependencies?: Record<string, string>;
      readonly peerDependencies?: Record<string, string>;
      readonly peerDependenciesMeta?: Record<string, { readonly optional?: boolean }>;
    };

    expect(packageJson.peerDependencies).toEqual({
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      vite: "^8.0.0",
    });
    expect(packageJson.dependencies?.nitro).toBe("3.0.260429-beta");
    expect(packageJson.peerDependenciesMeta).toBeUndefined();
    expect(packageJson.dependencies?.["@vitejs/plugin-rsc"]).toBe("0.5.26");
    expect(packageJson.dependencies?.typescript).toBe("6.0.3");
  });

  test("deployment and API reference docs use the published package name", () => {
    const denoDeployDoc = readDoc("www/src/routes/docs/deno-deploy.tsx");
    const apiReferenceDoc = normalizeWhitespace(readDoc("www/src/routes/docs/api-reference.tsx"));

    expect(denoDeployDoc).toContain('"litzjs/": "npm:litzjs@latest/"');
    expect(denoDeployDoc).not.toContain('"litzjs/": "npm:litz@latest/"');

    expect(apiReferenceDoc).toContain(
      "Complete reference for all exports from litzjs, litzjs/client, litzjs/server, and litzjs/vite.",
    );
    expect(apiReferenceDoc).toContain('title="litzjs"');
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

  test("api reference covers the complete documented public package surface", () => {
    const apiReferenceDoc = normalizeWhitespace(readDoc("www/src/routes/docs/api-reference.tsx"));

    const litzExports = [
      "ActionErrorResultFor",
      "ActionHookResult",
      "ActionHookResultFor",
      "ActionSuccessResultFor",
      "ApiFetchOptions",
      "ApiHandlerContext",
      "ApiRouteHandler",
      "ApiRouteHandlers",
      "ApiRouteMethod",
      "DataResult",
      "DefineApiRouteOptions",
      "DefineLayoutOptions",
      "DefineRouteOptions",
      "ErrorResult",
      "FaultResult",
      "FormDataPayloadRecord",
      "FormDataPayloadValue",
      "FormJsonValue",
      "InputParserContext",
      "InputValidationOptions",
      "InvalidResult",
      "LayoutReference",
      "LitzApiRoute",
      "LitzLayout",
      "LitzLocation",
      "LitzMatch",
      "LitzResource",
      "LitzRoute",
      "LoaderHookResult",
      "LoaderHookResultFor",
      "Middleware",
      "MiddlewareContext",
      "MiddlewareHandler",
      "MiddlewareNext",
      "MiddlewareOverrides",
      "MiddlewareRef",
      "NormalizedResult",
      "PathParams",
      "RedirectResult",
      "ResourceComponentProps",
      "ResourceHandlerContext",
      "ResourceRequest",
      "ResourceServerHandler",
      "RouteErrorLike",
      "RouteExplicitErrorLike",
      "RouteFaultLike",
      "RouteFormProps",
      "RouteHandlerContext",
      "RouteServerHandler",
      "RouteStatus",
      "SearchParamRecord",
      "SearchParamValue",
      "SearchParamsUpdate",
      "ServerHandler",
      "ServerResult",
      "SetResourceSearchParams",
      "SetSearchParams",
      "SubmitOptions",
      "SubmitPayload",
      "ValidatedInput",
      "ViewResult",
      "data",
      "defineApiRoute",
      "defineLayout",
      "defineResource",
      "defineRoute",
      "error",
      "fault",
      "formJson",
      "invalid",
      "redirect",
      "server",
      "useLocation",
      "useMatches",
      "usePathname",
      "view",
      "withHeaders",
    ];

    const clientExports = [
      "Link",
      "MountAppOptions",
      "mountApp",
      "useLocation",
      "useMatches",
      "useNavigate",
      "usePathname",
    ];

    const serverExports = ["CreateServerOptions", "createServer"];

    const viteExports = [
      "buildLitzApp",
      "LitzPluginOptions",
      "cleanupRscPluginArtifacts",
      "litz",
      "transformServerModuleSource",
    ];

    for (const symbol of litzExports) {
      expect(apiReferenceDoc).toContain(symbol);
    }

    for (const symbol of clientExports) {
      expect(apiReferenceDoc).toContain(symbol);
    }

    for (const symbol of serverExports) {
      expect(apiReferenceDoc).toContain(symbol);
    }

    for (const symbol of viteExports) {
      expect(apiReferenceDoc).toContain(symbol);
    }

    expect(apiReferenceDoc).toContain("expected application failures");
    expect(apiReferenceDoc).toContain("unexpected runtime failures");
    expect(apiReferenceDoc).toContain(
      "`route.useData()`, `route.useView()`, and `route.useError()` return the latest settled loader/action state for that route.",
    );
    expect(apiReferenceDoc).toContain("resource.Component");
    expect(apiReferenceDoc).toContain(
      'Import from <code className="text-sky-400">{importPath}</code>.',
    );
    expect(apiReferenceDoc).toContain("baseUrl?: string | URL;");
    expect(apiReferenceDoc).toContain("Adds an absolute base URL for server-side or test callers");
    expect(apiReferenceDoc).toContain(
      "same callable handler with lightweight marker metadata attached",
    );
    expect(apiReferenceDoc).toContain(
      "invalid<TData = unknown>(options?: { headers?: HeadersInit; status?: number; fields?: Record<string, string>; formError?: string; data?: TData }): InvalidResult<TData>",
    );
    expect(apiReferenceDoc).toContain(
      "Most apps only need `litz(...)`, but the helper exports are public",
    );
  });
});
