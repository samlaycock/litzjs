import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readSource(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("docs shell source", () => {
  test("uses unique search ids for desktop and mobile docs nav", () => {
    const docsShellSource = readSource("www/src/components/docs-shell.tsx");

    expect(docsShellSource).toContain('searchId="docs-search-mobile"');
    expect(docsShellSource).toContain('searchId="docs-search-desktop"');
  });

  test("checks the execCommand fallback result before treating copy as successful", () => {
    const codeBlockSource = readSource("www/src/components/code-block.tsx");

    expect(codeBlockSource).toContain('const copied = document.execCommand("copy");');
    expect(codeBlockSource).toContain("if (!copied) {");
    expect(codeBlockSource).toContain('throw new Error("execCommand copy failed");');
  });
});
