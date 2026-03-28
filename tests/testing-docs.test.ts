import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readDoc(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function normalizeWhitespace(value: string) {
  return value.replaceAll(/\s+/g, " ").trim();
}

describe("testing docs", () => {
  test("use Bun-first runnable examples", () => {
    const testingDoc = normalizeWhitespace(readDoc("www/src/routes/docs/testing.tsx"));

    expect(testingDoc).toContain(
      'Run the examples on this page with <code className="text-sky-400">bun test</code>',
    );
    expect(testingDoc).toContain('import { describe, expect, test } from "bun:test";');
    expect(testingDoc).toContain("const result = await loader({");
    expect(testingDoc).toContain("const response = await api.methods.GET({");
    expect(testingDoc).toContain("const response = await app.fetch(");
    expect(testingDoc).toContain("bun add -d @testing-library/react @testing-library/dom");

    expect(testingDoc).not.toContain('from "vitest"');
    expect(testingDoc).not.toContain("callLoader(");
    expect(testingDoc).not.toContain("const response = await app(");
  });
});
