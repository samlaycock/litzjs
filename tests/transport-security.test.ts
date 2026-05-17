import { afterEach, describe, expect, test } from "bun:test";

import { createPublicResultHeaders } from "../src/client/result-headers";
import {
  configureDataSerializer,
  parseActionResponse,
  parseLoaderBatchResponse,
  parseLoaderResponse,
} from "../src/client/transport";

const bigintSerializer = {
  stringify(value: unknown): string {
    return JSON.stringify(value, (_key, nestedValue) =>
      typeof nestedValue === "bigint"
        ? { __litzjsTestBigInt: nestedValue.toString() }
        : nestedValue,
    );
  },
  parse(text: string): unknown {
    return JSON.parse(text, (_key, nestedValue) => {
      if (
        nestedValue &&
        typeof nestedValue === "object" &&
        "__litzjsTestBigInt" in nestedValue &&
        typeof nestedValue.__litzjsTestBigInt === "string"
      ) {
        return BigInt(nestedValue.__litzjsTestBigInt);
      }

      return nestedValue;
    }) as unknown;
  },
};

function createTransportResponse(body: unknown): Response {
  return new Response(bigintSerializer.stringify(body), {
    headers: {
      "content-type": "application/vnd.litzjs.result+json",
    },
  });
}

afterEach(() => {
  configureDataSerializer(undefined);
});

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

  test("uses the configured serializer for loader data responses", async () => {
    configureDataSerializer(bigintSerializer);

    const result = await parseLoaderResponse(
      createTransportResponse({
        kind: "data",
        data: { count: 9007199254740993n },
      }),
    );

    expect(result.kind).toBe("data");
    if (result.kind !== "data") {
      throw new Error("Expected data result.");
    }
    expect(result.data).toEqual({ count: 9007199254740993n });
  });

  test("uses the configured serializer for action data responses", async () => {
    configureDataSerializer(bigintSerializer);

    const result = await parseActionResponse(
      createTransportResponse({
        kind: "data",
        data: { count: 9007199254740995n },
      }),
    );

    expect(result?.kind).toBe("data");
    if (result?.kind !== "data") {
      throw new Error("Expected data result.");
    }
    expect(result.data).toEqual({ count: 9007199254740995n });
  });

  test("uses the configured serializer for batched loader data responses", async () => {
    configureDataSerializer(bigintSerializer);

    const [result] = await parseLoaderBatchResponse(
      createTransportResponse({
        kind: "batch",
        results: [
          {
            status: 200,
            body: {
              kind: "data",
              data: { count: 9007199254740997n },
            },
          },
        ],
      }),
    );

    expect(result?.status).toBe("fulfilled");

    if (result?.status !== "fulfilled") {
      throw new Error("Expected fulfilled batch result.");
    }

    expect(result.value.kind).toBe("data");
    if (result.value.kind !== "data") {
      throw new Error("Expected data result.");
    }
    expect(result.value.data).toEqual({ count: 9007199254740997n });
  });

  test("keeps JSON as the default data serializer", async () => {
    const result = await parseLoaderResponse(
      new Response(
        JSON.stringify({
          kind: "data",
          data: { count: 1 },
        }),
        {
          headers: {
            "content-type": "application/vnd.litzjs.result+json",
          },
        },
      ),
    );

    expect(result.kind).toBe("data");
    if (result.kind !== "data") {
      throw new Error("Expected data result.");
    }
    expect(result.data).toEqual({ count: 1 });
  });
});
