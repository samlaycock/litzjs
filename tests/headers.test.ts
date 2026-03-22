import { describe, expect, test } from "bun:test";

import { data, withHeaders } from "../src/index";

describe("header merging", () => {
  test("preserves multiple set-cookie values when merging response headers", () => {
    const response = withHeaders(
      new Response("ok", {
        headers: {
          "set-cookie": "first=1; Path=/",
        },
      }),
      {
        "set-cookie": "second=2; Path=/",
      },
    );
    const setCookie = response.headers.getSetCookie?.() ?? [];

    expect(setCookie).toEqual(["first=1; Path=/", "second=2; Path=/"]);
  });

  test("preserves multiple set-cookie values when merging result headers", () => {
    const result = withHeaders(
      data({ ok: true }, { headers: { "set-cookie": "first=1; Path=/" } }),
      {
        "set-cookie": "second=2; Path=/",
      },
    );
    const headers = new Headers(result.headers);
    const setCookie = headers.getSetCookie?.() ?? [];

    expect(setCookie).toEqual(["first=1; Path=/", "second=2; Path=/"]);
  });
});
