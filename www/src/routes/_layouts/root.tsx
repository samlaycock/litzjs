import { defineLayout } from "litzjs";
import { Link, useLocation } from "litzjs/client";
import { useState } from "react";
import { DiGithubBadge, DiNpm } from "react-icons/di";

import { siteMetadata } from "../../site-metadata";

const DOCS_NAV = [
  {
    title: "Getting Started",
    items: [
      { title: "Introduction", path: "/docs" },
      { title: "Installation", path: "/docs/installation" },
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

export const layout = defineLayout("/layouts/root", {
  component: RootLayout,
});

function RootLayout({ children }: React.PropsWithChildren<{}>) {
  const location = useLocation();
  const isDocs = location.pathname.startsWith("/docs");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navContent = (
    <nav className="flex flex-col gap-6">
      {DOCS_NAV.map((section) => (
        <div key={section.title}>
          <h3 className="text-neutral-400 text-xs uppercase tracking-wider mb-2">
            {section.title}
          </h3>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => (
              <li key={item.path}>
                <Link
                  href={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block py-1 px-2 text-sm rounded transition-colors ${
                    location.pathname === item.path
                      ? "text-sky-500 bg-neutral-800"
                      : "text-neutral-300 hover:text-sky-400 hover:bg-neutral-800/50"
                  }`}
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex flex-col min-h-screen w-screen font-mono bg-neutral-950 [--site-header-height:4rem] sm:[--site-header-height:5rem]">
      <header className="sticky top-0 z-50 flex flex-row justify-between items-center gap-4 p-4 sm:gap-6 sm:p-6 border-b border-neutral-800 bg-neutral-950">
        <div className="flex flex-row items-center gap-6">
          <Link href="/" className="flex flex-col">
            <h1 className="text-sky-50 text-xl font-semibold">
              Lit<span className="text-sky-500">z</span>
            </h1>
          </Link>
          <nav className="flex flex-row gap-4">
            <Link
              href="/docs"
              className={`text-sm hover:text-sky-400 transition-colors ${
                isDocs ? "text-sky-500" : "text-neutral-400"
              }`}
            >
              <span className="sm:hidden">Docs</span>
              <span className="hidden sm:inline">Documentation</span>
            </Link>
          </nav>
        </div>
        <div className="flex flex-row items-center gap-2">
          <a href={siteMetadata.npmPackageUrl} target="_blank" rel="noreferrer">
            <DiNpm size={32} className="fill-sky-500 hover:fill-sky-400" />
          </a>
          <a href={siteMetadata.githubRepositoryUrl} target="_blank" rel="noreferrer">
            <DiGithubBadge size={32} className="fill-sky-500 hover:fill-sky-400" />
          </a>
        </div>
      </header>
      {isDocs ? (
        <div className="flex-1 flex flex-col md:flex-row">
          {/* Mobile menu button */}
          <div className="md:hidden flex items-center justify-between p-4 border-b border-neutral-800">
            <span className="text-neutral-400 text-sm">Documentation</span>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-neutral-400 hover:text-sky-400 p-1"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="md:hidden absolute top-30 left-0 right-0 bg-neutral-950 border-b border-neutral-800 p-4 z-40 max-h-[calc(100vh-120px)] overflow-y-auto">
              {navContent}
            </div>
          )}

          {/* Desktop sidebar */}
          <aside className="hidden md:flex md:sticky md:top-(--site-header-height) md:h-[calc(100vh-var(--site-header-height))] flex-col w-64 shrink-0 border-r border-neutral-800 p-4 overflow-y-auto">
            {navContent}
          </aside>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto p-6 md:p-8">
              <article className="prose prose-invert max-w-none">{children}</article>
            </div>
          </main>
        </div>
      ) : (
        <main className="flex-1 overflow-y-auto">{children}</main>
      )}
      <footer className="flex flex-row justify-center py-2 px-4 border-t border-neutral-800">
        <span className="text-neutral-600 text-sm">
          &copy;{" "}
          <a
            href="https://github.com/samlaycock"
            target="_blank"
            rel="noreferrer"
            className="hover:underline hover:underline-offset-4"
          >
            Samuel Laycock
          </a>{" "}
          {new Date().getFullYear()}
        </span>
      </footer>
    </div>
  );
}
