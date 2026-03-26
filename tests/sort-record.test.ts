import { describe, expect, test } from "bun:test";

import { sortRecord } from "../src/client/sort-record";

describe("sortRecord", () => {
  test("returns a new record with keys sorted alphabetically", () => {
    const input = {
      zebra: "last",
      apple: "first",
      mango: "middle",
    };

    const sorted = sortRecord(input);

    expect(Object.keys(sorted)).toEqual(["apple", "mango", "zebra"]);
    expect(sorted).toEqual({
      apple: "first",
      mango: "middle",
      zebra: "last",
    });
    expect(sorted).not.toBe(input);
    expect(input).toEqual({
      zebra: "last",
      apple: "first",
      mango: "middle",
    });
  });
});
