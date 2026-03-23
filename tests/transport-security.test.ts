import { describe, expect, test } from "bun:test";

import { createPublicResultHeaders } from "../src/client/result-headers";

describe("transport security", () => {
  test("does not expose arbitrary server headers to client hooks", async () => {
    const result = createPublicResultHeaders(
      new Headers({
        "content-type": "application/vnd.litzjs.result+json",
        "x-litzjs-kind": "data",
        "x-litzjs-revalidate": "/projects",
        "x-litzjs-secret": "should-not-leak",
        "x-litzjs-public-trace": "public",
        authorization: "Bearer secret",
        "x-internal-token": "secret",
      }),
    );

    expect(result.get("x-litzjs-kind")).toBe("data");
    expect(result.get("x-litzjs-revalidate")).toBe("/projects");
    expect(result.get("x-litzjs-public-trace")).toBe("public");
    expect(result.get("x-litzjs-secret")).toBeNull();
    expect(result.get("authorization")).toBeNull();
    expect(result.get("x-internal-token")).toBeNull();
  });
});
