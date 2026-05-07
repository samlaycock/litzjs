import { describe, expect, test } from "bun:test";

import { invalid, server } from "../src/index";

describe("result helpers", () => {
  test("invalid() supports an omitted options object", () => {
    expect(invalid()).toEqual({
      kind: "invalid",
      headers: undefined,
      status: undefined,
      fields: undefined,
      formError: undefined,
      data: undefined,
    });
  });

  test("server() attaches framework marker metadata without changing callability", async () => {
    const handler = server(async () => invalid());

    expect(handler.__litzServer).toBe(true);
    const result = await handler({} as never);

    expect(result).toEqual(invalid());
  });
});
