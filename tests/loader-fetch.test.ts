import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { LoaderSettledResult } from "../src/client/loader-fetch";
import type { LoaderHookResult } from "../src/index";

const mockFetchRouteLoader = mock();

void mock.module("../src/client/runtime", () => ({
  fetchRouteLoader: mockFetchRouteLoader,
  isRedirectSignal(value: unknown): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      "kind" in value &&
      (value as { kind: string }).kind === "redirect"
    );
  },
  isRouteLikeError(value: unknown): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      "kind" in value &&
      ((value as { kind: string }).kind === "error" || (value as { kind: string }).kind === "fault")
    );
  },
}));

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

beforeEach(() => {
  mockFetchRouteLoader.mockReset();
});

describe("fetchRouteLoadersInParallel", () => {
  test("fetches all loaders concurrently rather than sequentially", async () => {
    let activeCalls = 0;
    let maxConcurrentCalls = 0;

    mockFetchRouteLoader.mockImplementation(
      () =>
        new Promise<LoaderHookResult>((resolve) => {
          activeCalls++;
          maxConcurrentCalls = Math.max(maxConcurrentCalls, activeCalls);
          setTimeout(() => {
            activeCalls--;
            resolve(createDataResult({ value: "ok" }));
          }, 10);
        }),
    );

    const { fetchRouteLoadersInParallel } = await import("../src/client/loader-fetch");

    const matches = [createMatch("layout-a"), createMatch("layout-b"), createMatch("route")];

    await fetchRouteLoadersInParallel(matches, {
      routePath: "/test",
      baseRequest: { params: {}, search: new URLSearchParams() },
    });

    expect(maxConcurrentCalls).toBe(3);
    expect(mockFetchRouteLoader).toHaveBeenCalledTimes(3);
  });

  test("returns results in the same order as input matches", async () => {
    const resolvers: Array<(result: LoaderHookResult) => void> = [];

    mockFetchRouteLoader.mockImplementation(
      () =>
        new Promise<LoaderHookResult>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const { fetchRouteLoadersInParallel } = await import("../src/client/loader-fetch");

    const matches = [createMatch("first"), createMatch("second"), createMatch("third")];

    const promise = fetchRouteLoadersInParallel(matches, {
      routePath: "/test",
      baseRequest: { params: {}, search: new URLSearchParams() },
    });

    // Resolve in reverse order
    resolvers[2]!(createDataResult("third-data"));
    resolvers[0]!(createDataResult("first-data"));
    resolvers[1]!(createDataResult("second-data"));

    const results = await promise;

    expect(results).toHaveLength(3);
    expect(results[0]!.status).toBe("fulfilled");
    expect(results[1]!.status).toBe("fulfilled");
    expect(results[2]!.status).toBe("fulfilled");

    const values = results.map((r) => (r as PromiseFulfilledResult<unknown>).value) as Array<{
      match: { id: string };
      loaderResult: LoaderHookResult;
    }>;

    expect(values[0]!.match.id).toBe("first");
    expect(values[1]!.match.id).toBe("second");
    expect(values[2]!.match.id).toBe("third");
  });

  test("passes abort signal to fetchRouteLoader", async () => {
    const receivedSignals: Array<AbortSignal | undefined> = [];

    mockFetchRouteLoader.mockImplementation(
      (_path: string, _req: unknown, _target: string, signal?: AbortSignal) => {
        receivedSignals.push(signal);
        return Promise.resolve(createDataResult("ok"));
      },
    );

    const { fetchRouteLoadersInParallel } = await import("../src/client/loader-fetch");

    const controller = new AbortController();
    const matches = [createMatch("a"), createMatch("b")];

    await fetchRouteLoadersInParallel(matches, {
      routePath: "/test",
      baseRequest: { params: {}, search: new URLSearchParams() },
      signal: controller.signal,
    });

    expect(receivedSignals).toHaveLength(2);
    expect(receivedSignals[0]).toBe(controller.signal);
    expect(receivedSignals[1]).toBe(controller.signal);
  });

  test("rejects in-flight fetches when signal is aborted", async () => {
    const controller = new AbortController();

    mockFetchRouteLoader.mockImplementation(
      (_path: string, _req: unknown, _target: string, signal?: AbortSignal) =>
        new Promise<LoaderHookResult>((resolve, reject) => {
          const onAbort = () =>
            reject(new DOMException("The operation was aborted.", "AbortError"));
          if (signal?.aborted) {
            onAbort();
            return;
          }
          signal?.addEventListener("abort", onAbort);
          // Never resolves naturally — only via abort
        }),
    );

    const { fetchRouteLoadersInParallel } = await import("../src/client/loader-fetch");

    const matches = [createMatch("a")];

    const promise = fetchRouteLoadersInParallel(matches, {
      routePath: "/test",
      baseRequest: { params: {}, search: new URLSearchParams() },
      signal: controller.signal,
    });

    controller.abort();

    const results = await promise;

    expect(results[0]!.status).toBe("rejected");
    expect((results[0] as PromiseRejectedResult).reason).toBeInstanceOf(DOMException);
  });

  test("captures rejected loaders without blocking other results", async () => {
    mockFetchRouteLoader.mockImplementation((_path: string, _req: unknown, target: string) => {
      if (target === "failing") {
        return Promise.reject({ kind: "error", status: 500, message: "fail" });
      }
      return Promise.resolve(createDataResult("ok"));
    });

    const { fetchRouteLoadersInParallel } = await import("../src/client/loader-fetch");

    const matches = [createMatch("ok-loader"), createMatch("failing"), createMatch("another-ok")];

    const results = await fetchRouteLoadersInParallel(matches, {
      routePath: "/test",
      baseRequest: { params: {}, search: new URLSearchParams() },
    });

    expect(results[0]!.status).toBe("fulfilled");
    expect(results[1]!.status).toBe("rejected");
    expect(results[2]!.status).toBe("fulfilled");
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
});
