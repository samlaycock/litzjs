import { describe, expect, test } from "bun:test";

import { sortRecord } from "../src/client/sort-record";

describe("sortRecord", () => {
  test("returns an empty record when given no entries", () => {
    expect(sortRecord({})).toEqual({});
  });

  test("returns a new record for a single-key input", () => {
    const input = {
      apple: "first",
    };

    const sorted = sortRecord(input);

    expect(sorted).toEqual({
      apple: "first",
    });
    expect(sorted).not.toBe(input);
  });

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

  test("sorts mixed-case keys using localeCompare ordering", () => {
    const input = {
      Zebra: "upper",
      apple: "lower",
      Mango: "title",
    };

    const expectedOrder = Object.keys(input).sort((left: string, right: string) =>
      left.localeCompare(right),
    );

    expect(Object.keys(sortRecord(input))).toEqual(expectedOrder);
  });
});
