import { describe, expect, test } from "bun:test";

import { createPublicResultHeaders } from "../src/client/result-headers";

describe("transport security", () => {
  test("does not expose arbitrary server headers to client hooks", async () => {
    const result = createPublicResultHeaders(
      new Headers({
        "content-type": "application/vnd.volt.result+json",
        "x-volt-kind": "data",
        "x-volt-revalidate": "/projects",
        "x-volt-secret": "should-not-leak",
        "x-volt-public-trace": "public",
        authorization: "Bearer secret",
        "x-internal-token": "secret",
      }),
    );

    expect(result.get("x-volt-kind")).toBe("data");
    expect(result.get("x-volt-revalidate")).toBe("/projects");
    expect(result.get("x-volt-public-trace")).toBe("public");
    expect(result.get("x-volt-secret")).toBeNull();
    expect(result.get("authorization")).toBeNull();
    expect(result.get("x-internal-token")).toBeNull();
  });
});
