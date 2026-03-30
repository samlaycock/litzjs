"use client";

import { Link } from "litzjs/client";
import { useEffect, useRef, useState } from "react";

import { DOCS_NAV } from "./docs-nav";
import { type DocHeading, filterDocsNav, synchronizeDocHeadings } from "./docs-shell-utils";

interface DocsShellProps {
  readonly pathname: string;
  readonly children: React.ReactNode;
}

export function DocsShell({ pathname, children }: DocsShellProps) {
  const articleRef = useRef<HTMLElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tocHeadings, setTocHeadings] = useState<readonly DocHeading[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const filteredDocsNav = filterDocsNav(DOCS_NAV, searchQuery);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const article = articleRef.current;

    if (!article) {
      setTocHeadings([]);
      return;
    }

    let frame = window.requestAnimationFrame(() => {
      setTocHeadings(synchronizeDocHeadings(article));
    });
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setTocHeadings(synchronizeDocHeadings(article));
      });
    });

    observer.observe(article, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  useEffect(() => {
    const article = articleRef.current;

    if (!article || tocHeadings.length === 0) {
      setActiveHeadingId(null);
      return;
    }

    function updateActiveHeading(): void {
      const headingElements = tocHeadings.flatMap((heading) => {
        const element = article.querySelector<HTMLElement>(`#${CSS.escape(heading.id)}`);

        if (!element) {
          return [];
        }

        const scrollMarginTop = Number.parseFloat(getComputedStyle(element).scrollMarginTop);

        return [
          {
            id: heading.id,
            top: element.getBoundingClientRect().top,
            threshold: Number.isFinite(scrollMarginTop) ? scrollMarginTop : 0,
          },
        ];
      });

      if (headingElements.length === 0) {
        setActiveHeadingId(null);
        return;
      }

      const currentHeading =
        headingElements.find((heading) => heading.top >= heading.threshold) ??
        headingElements[headingElements.length - 1];
      const activeId =
        headingElements.findLast((heading) => heading.top <= heading.threshold)?.id ??
        currentHeading.id;

      setActiveHeadingId((currentId) => (currentId === activeId ? currentId : activeId));
    }

    updateActiveHeading();

    window.addEventListener("scroll", updateActiveHeading, { passive: true });
    window.addEventListener("resize", updateActiveHeading);

    return () => {
      window.removeEventListener("scroll", updateActiveHeading);
      window.removeEventListener("resize", updateActiveHeading);
    };
  }, [pathname, tocHeadings]);

  const navSections =
    filteredDocsNav.length > 0 ? (
      filteredDocsNav.map((section) => (
        <div key={section.title}>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-neutral-400">
            {section.title}
          </h3>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => (
              <li key={item.path}>
                <Link
                  href={item.path}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSearchQuery("");
                  }}
                  className={`block px-2 py-1 text-sm transition-colors ${
                    pathname === item.path
                      ? "bg-neutral-800 text-sky-500"
                      : "text-neutral-300 hover:bg-neutral-800/50 hover:text-sky-400"
                  }`}
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))
    ) : (
      <div className="border border-dashed border-neutral-800 bg-neutral-900/40 px-4 py-5 text-sm text-neutral-400">
        No docs pages match <span className="text-neutral-200">“{searchQuery}”</span>.
      </div>
    );

  const navContent = (
    <nav className="flex flex-col">
      <div className="sticky top-0 z-10 bg-neutral-950 px-4 pt-6 pb-6">
        <label
          htmlFor="docs-search"
          className="mb-2 block text-xs uppercase tracking-[0.2em] text-neutral-500"
        >
          Search docs
        </label>
        <input
          id="docs-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search sections and pages"
          className="w-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
        />
      </div>
      <div className="flex flex-col gap-6 px-4 pb-6">{navSections}</div>
    </nav>
  );

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <div className="relative md:hidden">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Documentation</p>
            <p className="text-sm text-neutral-300">Browse pages and jump within this guide</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="p-1 text-neutral-400 transition-colors hover:text-sky-400"
            aria-expanded={mobileMenuOpen}
            aria-controls="docs-navigation"
            aria-label="Toggle documentation navigation"
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

        {mobileMenuOpen ? (
          <div
            id="docs-navigation"
            className="absolute top-full right-0 left-0 z-40 max-h-[calc(100vh-var(--site-header-height)-3.5rem)] overflow-y-auto border-b border-neutral-800 bg-neutral-950"
          >
            {navContent}
          </div>
        ) : null}
      </div>

      <aside
        className="hidden h-[calc(100vh-var(--site-header-height))] w-72 shrink-0 overflow-y-auto border-r border-neutral-800 md:sticky md:block"
        style={{ top: "var(--site-header-height)" }}
      >
        {navContent}
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-6 py-6 md:px-8 md:py-8">
          {tocHeadings.length > 0 ? (
            <div className="mb-8 hidden border border-neutral-800 bg-neutral-900/40 p-5 md:block xl:hidden">
              <DocsTableOfContents headings={tocHeadings} activeHeadingId={activeHeadingId} />
            </div>
          ) : null}

          <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_17rem] xl:gap-12">
            <article ref={articleRef} className="prose prose-invert max-w-none">
              {children}
            </article>

            <aside
              className="hidden self-start xl:sticky xl:block"
              style={{ top: "calc(var(--site-header-height) + 2rem)" }}
            >
              <div className="border border-neutral-800 bg-neutral-900/40 p-5">
                <DocsTableOfContents headings={tocHeadings} activeHeadingId={activeHeadingId} />
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

interface DocsTableOfContentsProps {
  readonly headings: readonly DocHeading[];
  readonly activeHeadingId: string | null;
}

function DocsTableOfContents({ headings, activeHeadingId }: DocsTableOfContentsProps) {
  return (
    <div>
      <p className="mb-3 text-xs uppercase tracking-[0.2em] text-neutral-500">On this page</p>
      {headings.length > 0 ? (
        <nav className="flex flex-col gap-1" aria-label="Table of contents">
          {headings.map((heading) => (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              aria-current={heading.id === activeHeadingId ? "location" : undefined}
              className={`px-3 py-2 text-sm transition-colors hover:bg-neutral-800/70 hover:text-sky-300 ${
                heading.level === 3 ? "ml-4" : ""
              } ${
                heading.id === activeHeadingId
                  ? "bg-neutral-800 text-sky-400"
                  : heading.level === 3
                    ? "text-neutral-400"
                    : "text-neutral-200"
              }`}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      ) : (
        <p className="text-sm text-neutral-500">
          Section links will appear once the page headings load.
        </p>
      )}
    </div>
  );
}
