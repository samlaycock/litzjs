import { describe, expect, test } from "bun:test";

import { DOCS_NAV } from "../www/src/components/docs-nav";
import { filterDocsNav, synchronizeDocHeadings } from "../www/src/components/docs-shell-utils";
import { installTestDom } from "./test-dom";

describe("docs shell utilities", () => {
  test("synchronizeDocHeadings assigns stable ids, adds anchor links, and returns TOC entries", () => {
    const dom = installTestDom();

    try {
      document.body.innerHTML = `
        <article>
          <h1>Server Configuration</h1>
          <h2>createServer</h2>
          <h2>Create Server</h2>
          <h3>Embedded assets</h3>
          <h4>Ignored leaf heading</h4>
        </article>
      `;

      const headings = synchronizeDocHeadings(document.body);
      const article = document.querySelector("article");
      const titleHeading = article?.querySelector("h1");
      const firstSectionHeading = article?.querySelector("h2");
      const secondSectionHeading = article?.querySelectorAll("h2")[1];
      const subSectionHeading = article?.querySelector("h3");

      expect(headings).toEqual([
        { id: "createserver", level: 2, text: "createServer" },
        { id: "create-server", level: 2, text: "Create Server" },
        { id: "embedded-assets", level: 3, text: "Embedded assets" },
      ]);
      expect(titleHeading?.id).toBe("server-configuration");
      expect(firstSectionHeading?.id).toBe("createserver");
      expect(secondSectionHeading?.id).toBe("create-server");
      expect(subSectionHeading?.id).toBe("embedded-assets");
      expect(titleHeading?.querySelector("[data-doc-heading-anchor]")?.getAttribute("href")).toBe(
        "#server-configuration",
      );
      expect(
        firstSectionHeading?.querySelector("[data-doc-heading-anchor]")?.getAttribute("href"),
      ).toBe("#createserver");
      expect(
        secondSectionHeading?.querySelector("[data-doc-heading-anchor]")?.getAttribute("href"),
      ).toBe("#create-server");
      expect(
        subSectionHeading?.querySelector("[data-doc-heading-anchor]")?.getAttribute("href"),
      ).toBe("#embedded-assets");
    } finally {
      dom.cleanup();
    }
  });

  test("filterDocsNav supports section-wide and item-level search", () => {
    expect(filterDocsNav(DOCS_NAV, "deployment")).toEqual([
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
    ]);

    expect(filterDocsNav(DOCS_NAV, "cloudflare")).toEqual([
      {
        title: "Deployment",
        items: [{ title: "Cloudflare Workers", path: "/docs/cloudflare-workers" }],
      },
    ]);
  });

  test("synchronizeDocHeadings avoids colliding with pre-existing heading ids", () => {
    const dom = installTestDom();

    try {
      document.body.innerHTML = `
        <article>
          <h2 id="overview">Overview</h2>
          <h2>Overview</h2>
        </article>
      `;

      const headings = synchronizeDocHeadings(document.body);
      const articleHeadings = Array.from(document.querySelectorAll("h2"));

      expect(headings).toEqual([
        { id: "overview", level: 2, text: "Overview" },
        { id: "overview-2", level: 2, text: "Overview" },
      ]);
      expect(articleHeadings[0]?.id).toBe("overview");
      expect(articleHeadings[1]?.id).toBe("overview-2");
    } finally {
      dom.cleanup();
    }
  });
});
