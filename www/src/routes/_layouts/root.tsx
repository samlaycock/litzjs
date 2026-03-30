import { defineLayout } from "litzjs";
import { Link, useLocation } from "litzjs/client";
import { DiGithubBadge, DiNpm } from "react-icons/di";

import { DocsShell } from "../../components/docs-shell";
import { siteMetadata } from "../../site-metadata";

export const layout = defineLayout("/layouts/root", {
  component: RootLayout,
});

function RootLayout({ children }: React.PropsWithChildren<{}>) {
  const location = useLocation();
  const isDocs = location.pathname.startsWith("/docs");

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
        <DocsShell pathname={location.pathname}>{children}</DocsShell>
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
