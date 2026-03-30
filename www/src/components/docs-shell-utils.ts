import type { DocsNavSection } from "./docs-nav";

export interface DocHeading {
  readonly id: string;
  readonly text: string;
  readonly level: 2 | 3;
}

function normalizeText(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

function getHeadingText(heading: HTMLHeadingElement): string {
  const clone = heading.cloneNode(true);

  if (!(clone instanceof HTMLElement)) {
    return "";
  }

  clone.querySelector("[data-doc-heading-anchor]")?.remove();

  return normalizeText(clone.textContent ?? "");
}

function createSlug(text: string): string {
  const normalizedText = normalizeText(text)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return normalizedText || "section";
}

export function createHeadingId(text: string, counts: Map<string, number>): string {
  const baseSlug = createSlug(text);
  const nextCount = (counts.get(baseSlug) ?? 0) + 1;

  counts.set(baseSlug, nextCount);

  return nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
}

function ensureAnchorLink(heading: HTMLHeadingElement, id: string): void {
  if (heading.querySelector("[data-doc-heading-anchor]")) {
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = `#${id}`;
  anchor.setAttribute("aria-label", `Link to ${getHeadingText(heading) || "section"}`);
  anchor.setAttribute("data-doc-heading-anchor", "true");
  anchor.className =
    "ml-2 inline align-baseline text-[0.8em] text-current/50 leading-none transition-colors hover:text-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400";
  anchor.textContent = "#";
  heading.append(anchor);
}

export function synchronizeDocHeadings(root: ParentNode): readonly DocHeading[] {
  const headingCounts = new Map<string, number>();
  const headings = Array.from(root.querySelectorAll<HTMLHeadingElement>("h1, h2, h3"));

  return headings.flatMap((heading) => {
    const text = getHeadingText(heading);

    if (!text) {
      return [];
    }

    const id = heading.id || createHeadingId(text, headingCounts);

    if (!heading.id) {
      heading.id = id;
    }

    heading.style.scrollMarginTop = "calc(var(--site-header-height) + 1rem)";
    ensureAnchorLink(heading, id);

    if (heading.tagName === "H2" || heading.tagName === "H3") {
      const level = Number.parseInt(heading.tagName.slice(1), 10) as 2 | 3;

      return [{ id, level, text }];
    }

    return [];
  });
}

function normalizeQuery(query: string): string {
  return normalizeText(query).toLowerCase();
}

export function filterDocsNav(
  sections: readonly DocsNavSection[],
  query: string,
): readonly DocsNavSection[] {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    return sections;
  }

  return sections.flatMap((section) => {
    if (section.title.toLowerCase().includes(normalizedQuery)) {
      return [section];
    }

    const items = section.items.filter((item) =>
      item.title.toLowerCase().includes(normalizedQuery),
    );

    return items.length > 0 ? [{ ...section, items }] : [];
  });
}
