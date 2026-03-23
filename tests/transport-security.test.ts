import { describe, expect, test } from "bun:test";

import { createPublicResultHeaders } from "../src/client/result-headers";

describe("transport security", () => {
  test("does not expose arbitrary server headers to client hooks", async () => {
    const result = createPublicResultHeaders(
      new Headers({
        "content-type": "application/vnd.litz.result+json",
        "x-litz-kind": "data",
        "x-litz-revalidate": "/projects",
        "x-litz-secret": "should-not-leak",
        "x-litz-public-trace": "public",
        authorization: "Bearer secret",
        "x-internal-token": "secret",
      }),
    );

    expect(result.get("x-litz-kind")).toBe("data");
    expect(result.get("x-litz-revalidate")).toBe("/projects");
    expect(result.get("x-litz-public-trace")).toBe("public");
    expect(result.get("x-litz-secret")).toBeNull();
    expect(result.get("authorization")).toBeNull();
    expect(result.get("x-internal-token")).toBeNull();
  });
});
