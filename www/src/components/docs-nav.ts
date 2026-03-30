export interface DocsNavItem {
  readonly title: string;
  readonly path: string;
}

export interface DocsNavSection {
  readonly title: string;
  readonly items: readonly DocsNavItem[];
}

export const DOCS_NAV: readonly DocsNavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Introduction", path: "/docs" },
      { title: "Installation", path: "/docs/installation" },
      { title: "First App", path: "/docs/first-app" },
      { title: "Quick Start", path: "/docs/quick-start" },
      { title: "Configuration", path: "/docs/configuration" },
    ],
  },
  {
    title: "Framework",
    items: [
      { title: "Routing", path: "/docs/routing" },
      { title: "Layouts", path: "/docs/layouts" },
      { title: "Navigation", path: "/docs/navigation" },
      { title: "Loaders & Actions", path: "/docs/loaders-and-actions" },
      { title: "Forms", path: "/docs/forms" },
      { title: "Resources", path: "/docs/resources" },
      { title: "API Routes", path: "/docs/api-routes" },
      { title: "Middleware", path: "/docs/middleware" },
      { title: "Error Handling", path: "/docs/error-handling" },
    ],
  },
  {
    title: "Guides",
    items: [
      { title: "Authentication", path: "/docs/authentication" },
      { title: "View Responses", path: "/docs/view-responses" },
      { title: "TypeScript", path: "/docs/typescript" },
      { title: "Testing", path: "/docs/testing" },
    ],
  },
  {
    title: "Deployment",
    items: [
      { title: "Server Configuration", path: "/docs/server-configuration" },
      { title: "Cloudflare Workers", path: "/docs/cloudflare-workers" },
      { title: "Deno Deploy", path: "/docs/deno-deploy" },
      { title: "Bun", path: "/docs/bun" },
      { title: "Node.js", path: "/docs/node" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "API Reference", path: "/docs/api-reference" },
      { title: "Troubleshooting", path: "/docs/troubleshooting" },
    ],
  },
];
