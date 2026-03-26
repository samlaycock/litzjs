import { describe, expect, test } from "bun:test";

import { createSearchParamRecord, createSearchParams } from "../src/search-params";

describe("search params helpers", () => {
  test("serializes repeated values from object input into repeated URL search params", () => {
    const search = createSearchParams({
      tag: ["framework", "bun"],
      term: "litz",
    });

    expect(Array.from(search.entries())).toEqual([
      ["tag", "framework"],
      ["tag", "bun"],
      ["term", "litz"],
    ]);
  });

  test("normalizes repeated URL search params into array values", () => {
    const record = createSearchParamRecord(new URLSearchParams("tag=framework&tag=bun&term=litz"));

    expect(record).toEqual({
      tag: ["framework", "bun"],
      term: "litz",
    });
  });
});
