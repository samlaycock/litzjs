import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { LoaderSettledResult } from "../src/client/loader-fetch";
import type { LoaderHookResult } from "../src/index";

const mockFetch = mock<typeof fetch>();
const originalFetch = globalThis.fetch;
const baseUrlTarget = globalThis as typeof globalThis & { __litzjsBaseUrl?: string };
const originalBaseUrl = baseUrlTarget.__litzjsBaseUrl;

import { processLoaderResults } from "../src/client/loader-fetch";

function createMatch(id: string) {
  return { id, cacheKey: `cache:${id}` };
}

function createDataResult(data: unknown): LoaderHookResult {
  return {
    kind: "data",
    status: 200,
    headers: new Headers(),
    data,
    stale: false,
  } as LoaderHookResult;
}

function createTransportResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/vnd.litzjs.result+json",
    },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  baseUrlTarget.__litzjsBaseUrl = originalBaseUrl;
});

describe("fetchRouteLoadersInParallel", () => {
  test("uses the configured client base for internal route loader requests", async () => {
    baseUrlTarget.__litzjsBaseUrl = "/app/";
    mockFetch.mockResolvedValue(
      createTransportResponse({
        kind: "data",
        data: "ok",
        revalidate: [],
      }),
    );

    const { fetchRouteLoader } = await import("../src/client/runtime");

    await fetchRouteLoader("/test", {
      params: {},
      search: new URLSearchParams(),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toBe("/app/_litzjs/route");
  });

  test("uses the configured client base for internal route action requests", async () => {
    baseUrlTarget.__litzjsBaseUrl = "/app/";
    mockFetch.mockResolvedValue(
      createTransportResponse({
        kind: "data",
        data: "ok",
        revalidate: [],
      }),
    );

    const { fetchRouteAction } = await import("../src/client/runtime");
    const payload = new FormData();
    payload.append("name", "Litz");

    await fetchRouteAction(
      "/test",
      {
        params: {},
        search: new URLSearchParams(),
      },
      payload,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toBe("/app/_litzjs/action");
  });

  test("fetches all loaders in a single batched request", async () => {
    const baseRequest = {
      params: { id: "7" },
      search: new URLSearchParams("tab=settings"),
    };
    const controller = new AbortController();

    mockFetch.mockResolvedValue(
      createTransportResponse({
        kind: "batch",
        results: [
          {
            status: 200,
            body: {
              kind: "data",
              data: "layout-data",
              revalidate: [],
            },
          },
          {
            status: 200,
            body: {
              kind: "data",
              data: "route-data",
              revalidate: [],
            },
          },
        ],
      }),
    );

    const { fetchRouteLoadersInParallel } = await import("../src/client/loader-fetch");

    const matches = [createMatch("layout-a"), createMatch("route")];

    const results = await fetchRouteLoadersInParallel(matches, {
      routePath: "/test",
      baseRequest,
      signal: controller.signal,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toBe("/_litzjs/route");
    expect((mockFetch.mock.calls[0]?.[1] as RequestInit | undefined)?.signal).toBe(
      controller.signal,
    );
    const requestBody = (mockFetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body;

    expect(typeof requestBody).toBe("string");
    expect(JSON.parse(requestBody as string)).toEqual({
      path: "/test",
      targets: ["layout-a", "route"],
      operation: "loader",
      request: {
        params: { id: "7" },
        search: {
          tab: "settings",
        },
      },
    });
    expect(results).toHaveLength(2);
    expect(results[0]!.status).toBe("fulfilled");
    expect(results[1]!.status).toBe("fulfilled");
    expect((results[0] as PromiseFulfilledResult<{ match: { id: string } }>).value.match.id).toBe(
      "layout-a",
    );
    expect((results[1] as PromiseFulfilledResult<{ match: { id: string } }>).value.match.id).toBe(
      "route",
    );
  });

  test("falls back to individual loader requests when the batched request fails", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("batch unsupported"))
      .mockResolvedValueOnce(
        createTransportResponse({
          kind: "data",
          data: "ok-loader-ok",
          revalidate: [],
        }),
      )
      .mockResolvedValueOnce(
        createTransportResponse(
          {
            kind: "fault",
            message: "fail",
          },
          500,
        ),
      );

    const { fetchRouteLoadersInParallel } = await import("../src/client/loader-fetch");

    const matches = [createMatch("ok-loader"), createMatch("failing")];

    const results = await fetchRouteLoadersInParallel(matches, {
      routePath: "/test",
      baseRequest: { params: {}, search: new URLSearchParams() },
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(results[0]!.status).toBe("fulfilled");
    expect(results[1]!.status).toBe("rejected");
  });
});

describe("processLoaderResults", () => {
  test("calls onResult for each fulfilled result in order", () => {
    const matches = [createMatch("a"), createMatch("b")];
    const resultA = createDataResult("data-a");
    const resultB = createDataResult("data-b");

    const settled: LoaderSettledResult[] = [
      { status: "fulfilled", value: { match: matches[0]!, loaderResult: resultA } },
      { status: "fulfilled", value: { match: matches[1]!, loaderResult: resultB } },
    ];

    const receivedResults: Array<{ id: string; result: LoaderHookResult }> = [];

    processLoaderResults(settled, matches, {
      onResult(match, loaderResult) {
        receivedResults.push({ id: match.id, result: loaderResult });
      },
      onRedirect() {},
      onRouteError() {},
    });

    expect(receivedResults).toHaveLength(2);
    expect(receivedResults[0]!.id).toBe("a");
    expect(receivedResults[1]!.id).toBe("b");
  });

  test("calls onRedirect for the first redirect and stops processing", () => {
    const matches = [createMatch("a"), createMatch("b")];

    const settled: LoaderSettledResult[] = [
      {
        status: "rejected",
        reason: {
          kind: "redirect",
          status: 302,
          location: "/new",
          headers: new Headers(),
          replace: false,
        },
      },
      { status: "fulfilled", value: { match: matches[1]!, loaderResult: createDataResult("b") } },
    ];

    let redirectLocation: string | undefined;
    const receivedResults: string[] = [];

    processLoaderResults(settled, matches, {
      onResult(match) {
        receivedResults.push(match.id);
      },
      onRedirect(location) {
        redirectLocation = location;
      },
      onRouteError() {},
    });

    expect(redirectLocation).toBe("/new");
    expect(receivedResults).toHaveLength(0);
  });

  test("calls onRouteError for the first route error and stops processing", () => {
    const matches = [createMatch("a"), createMatch("b"), createMatch("c")];
    const routeError = { kind: "error", status: 500, message: "broken", headers: new Headers() };

    const settled: LoaderSettledResult[] = [
      { status: "fulfilled", value: { match: matches[0]!, loaderResult: createDataResult("a") } },
      { status: "rejected", reason: routeError },
      { status: "fulfilled", value: { match: matches[2]!, loaderResult: createDataResult("c") } },
    ];

    let errorMatchId: string | undefined;
    const receivedResults: string[] = [];

    processLoaderResults(settled, matches, {
      onResult(match) {
        receivedResults.push(match.id);
      },
      onRedirect() {},
      onRouteError(matchId) {
        errorMatchId = matchId;
      },
    });

    expect(receivedResults).toEqual(["a"]);
    expect(errorMatchId).toBe("b");
  });

  test("rethrows unknown errors", () => {
    const matches = [createMatch("a")];

    const settled: LoaderSettledResult[] = [
      { status: "rejected", reason: new TypeError("network failure") },
    ];

    expect(() => {
      processLoaderResults(settled, matches, {
        onResult() {},
        onRedirect() {},
        onRouteError() {},
      });
    }).toThrow("network failure");
  });

  test("stops processing when isCancelled returns true", () => {
    const matches = [createMatch("a"), createMatch("b")];

    const settled: LoaderSettledResult[] = [
      { status: "fulfilled", value: { match: matches[0]!, loaderResult: createDataResult("a") } },
      { status: "fulfilled", value: { match: matches[1]!, loaderResult: createDataResult("b") } },
    ];

    let callCount = 0;

    processLoaderResults(settled, matches, {
      isCancelled: () => callCount > 0,
      onResult() {
        callCount++;
      },
      onRedirect() {},
      onRouteError() {},
    });

    expect(callCount).toBe(1);
  });

  test("does not enter callbacks when already cancelled before processing starts", () => {
    const matches = [createMatch("a")];
    const onResult = mock();
    const onRedirect = mock();
    const onRouteError = mock();

    processLoaderResults(
      [{ status: "fulfilled", value: { match: matches[0]!, loaderResult: createDataResult("a") } }],
      matches,
      {
        isCancelled: () => true,
        onResult,
        onRedirect,
        onRouteError,
      },
    );

    expect(onResult).not.toHaveBeenCalled();
    expect(onRedirect).not.toHaveBeenCalled();
    expect(onRouteError).not.toHaveBeenCalled();
  });
});
