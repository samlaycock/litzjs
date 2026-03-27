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

describe("processLoaderResults offline handling", () => {
  describe("resolveOfflineEligible + onOfflineStale", () => {
    test("calls onOfflineStale instead of onRouteError when match is offline-eligible", () => {
      const matches = [createMatch("a"), createMatch("b")];
      const routeError = {
        kind: "error",
        status: 500,
        message: "server down",
        headers: new Headers(),
      };

      const settled: LoaderSettledResult[] = [
        {
          status: "fulfilled",
          value: { match: matches[0]!, loaderResult: createDataResult("a-data") },
        },
        { status: "rejected", reason: routeError },
      ];

      let offlineStaleMatchId: string | undefined;
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
        resolveOfflineEligible(matchId) {
          return matchId === "b";
        },
        onOfflineStale(matchId) {
          offlineStaleMatchId = matchId;
        },
      });

      expect(receivedResults).toEqual(["a"]);
      expect(offlineStaleMatchId).toBe("b");
      expect(errorMatchId).toBeUndefined();
    });

    test("continues processing after onOfflineStale instead of stopping", () => {
      const matches = [createMatch("a"), createMatch("b"), createMatch("c")];
      const routeError = { kind: "error", status: 500, message: "fail", headers: new Headers() };

      const settled: LoaderSettledResult[] = [
        {
          status: "fulfilled",
          value: { match: matches[0]!, loaderResult: createDataResult("a-data") },
        },
        { status: "rejected", reason: routeError },
        {
          status: "fulfilled",
          value: { match: matches[2]!, loaderResult: createDataResult("c-data") },
        },
      ];

      const offlineStaleIds: string[] = [];
      const receivedResults: string[] = [];

      processLoaderResults(settled, matches, {
        onResult(match) {
          receivedResults.push(match.id);
        },
        onRedirect() {},
        onRouteError() {},
        resolveOfflineEligible(matchId) {
          return matchId === "b";
        },
        onOfflineStale(matchId) {
          offlineStaleIds.push(matchId);
        },
      });

      expect(receivedResults).toEqual(["a", "c"]);
      expect(offlineStaleIds).toEqual(["b"]);
    });

    test("falls back to onRouteError when resolveOfflineEligible returns false", () => {
      const matches = [createMatch("a")];
      const routeError = { kind: "error", status: 500, message: "fail", headers: new Headers() };

      const settled: LoaderSettledResult[] = [{ status: "rejected", reason: routeError }];

      let errorMatchId: string | undefined;
      let offlineStaleMatchId: string | undefined;

      processLoaderResults(settled, matches, {
        onResult() {},
        onRedirect() {},
        onRouteError(matchId) {
          errorMatchId = matchId;
        },
        resolveOfflineEligible() {
          return false;
        },
        onOfflineStale(matchId) {
          offlineStaleMatchId = matchId;
        },
      });

      expect(errorMatchId).toBe("a");
      expect(offlineStaleMatchId).toBeUndefined();
    });

    test("falls back to onRouteError when resolveOfflineEligible is not provided", () => {
      const matches = [createMatch("a")];
      const routeError = { kind: "error", status: 500, message: "fail", headers: new Headers() };

      const settled: LoaderSettledResult[] = [{ status: "rejected", reason: routeError }];

      let errorMatchId: string | undefined;

      processLoaderResults(settled, matches, {
        onResult() {},
        onRedirect() {},
        onRouteError(matchId) {
          errorMatchId = matchId;
        },
      });

      expect(errorMatchId).toBe("a");
    });

    test("handles network errors through offline path when eligible", () => {
      const matches = [createMatch("a")];

      const settled: LoaderSettledResult[] = [
        { status: "rejected", reason: new TypeError("Failed to fetch") },
      ];

      let offlineStaleMatchId: string | undefined;

      processLoaderResults(settled, matches, {
        onResult() {},
        onRedirect() {},
        onRouteError() {},
        resolveOfflineEligible() {
          return true;
        },
        onOfflineStale(matchId) {
          offlineStaleMatchId = matchId;
        },
      });

      expect(offlineStaleMatchId).toBe("a");
    });

    test("rethrows unknown errors when not offline-eligible", () => {
      const matches = [createMatch("a")];

      const settled: LoaderSettledResult[] = [
        { status: "rejected", reason: new TypeError("Failed to fetch") },
      ];

      expect(() => {
        processLoaderResults(settled, matches, {
          onResult() {},
          onRedirect() {},
          onRouteError() {},
          resolveOfflineEligible() {
            return false;
          },
          onOfflineStale() {},
        });
      }).toThrow("Failed to fetch");
    });

    test("rethrows unknown errors when no offline callbacks provided", () => {
      const matches = [createMatch("a")];

      const settled: LoaderSettledResult[] = [
        { status: "rejected", reason: new TypeError("Failed to fetch") },
      ];

      expect(() => {
        processLoaderResults(settled, matches, {
          onResult() {},
          onRedirect() {},
          onRouteError() {},
        });
      }).toThrow("Failed to fetch");
    });

    test("redirects still take priority over offline handling", () => {
      const matches = [createMatch("a")];

      const settled: LoaderSettledResult[] = [
        {
          status: "rejected",
          reason: {
            kind: "redirect",
            status: 302,
            location: "/login",
            headers: new Headers(),
            replace: false,
          },
        },
      ];

      let redirectLocation: string | undefined;
      let offlineStaleMatchId: string | undefined;

      processLoaderResults(settled, matches, {
        onResult() {},
        onRedirect(location) {
          redirectLocation = location;
        },
        onRouteError() {},
        resolveOfflineEligible() {
          return true;
        },
        onOfflineStale(matchId) {
          offlineStaleMatchId = matchId;
        },
      });

      expect(redirectLocation).toBe("/login");
      expect(offlineStaleMatchId).toBeUndefined();
    });

    test("preserves offline-stale status across multi-loader chains", () => {
      const matches = [createMatch("layout"), createMatch("middle"), createMatch("route")];
      const routeError = {
        kind: "error",
        status: 503,
        message: "unavailable",
        headers: new Headers(),
      };

      const settled: LoaderSettledResult[] = [
        {
          status: "fulfilled",
          value: { match: matches[0]!, loaderResult: createDataResult("layout-data") },
        },
        { status: "rejected", reason: routeError },
        {
          status: "fulfilled",
          value: { match: matches[2]!, loaderResult: createDataResult("route-data") },
        },
      ];

      const offlineStaleIds: string[] = [];
      const resultIds: string[] = [];

      processLoaderResults(settled, matches, {
        onResult(match) {
          resultIds.push(match.id);
        },
        onRedirect() {},
        onRouteError() {},
        resolveOfflineEligible(matchId) {
          return matchId === "middle";
        },
        onOfflineStale(matchId) {
          offlineStaleIds.push(matchId);
        },
      });

      expect(resultIds).toEqual(["layout", "route"]);
      expect(offlineStaleIds).toEqual(["middle"]);
    });

    test("handles multiple offline-stale matches in the same chain", () => {
      const matches = [createMatch("a"), createMatch("b"), createMatch("c")];
      const routeError = { kind: "error", status: 500, message: "fail", headers: new Headers() };

      const settled: LoaderSettledResult[] = [
        { status: "rejected", reason: routeError },
        { status: "rejected", reason: routeError },
        {
          status: "fulfilled",
          value: { match: matches[2]!, loaderResult: createDataResult("c-data") },
        },
      ];

      const offlineStaleIds: string[] = [];
      const resultIds: string[] = [];

      processLoaderResults(settled, matches, {
        onResult(match) {
          resultIds.push(match.id);
        },
        onRedirect() {},
        onRouteError() {},
        resolveOfflineEligible() {
          return true;
        },
        onOfflineStale(matchId) {
          offlineStaleIds.push(matchId);
        },
      });

      expect(offlineStaleIds).toEqual(["a", "b"]);
      expect(resultIds).toEqual(["c"]);
    });
  });

  describe("resolveHasOfflineFallback", () => {
    test("routes raw network errors through onRouteError when fallback is available", () => {
      const matches = [createMatch("a")];

      const settled: LoaderSettledResult[] = [
        { status: "rejected", reason: new TypeError("Failed to fetch") },
      ];

      let errorMatchId: string | undefined;
      let errorValue: unknown;

      processLoaderResults(settled, matches, {
        onResult() {},
        onRedirect() {},
        onRouteError(matchId, error) {
          errorMatchId = matchId;
          errorValue = error;
        },
        resolveHasOfflineFallback() {
          return true;
        },
      });

      expect(errorMatchId).toBe("a");
      expect(errorValue).toEqual({
        kind: "fault",
        status: 0,
        headers: expect.any(Headers),
        message: "Failed to fetch",
      });
    });

    test("still throws raw network errors when no fallback is available", () => {
      const matches = [createMatch("a")];

      const settled: LoaderSettledResult[] = [
        { status: "rejected", reason: new TypeError("Failed to fetch") },
      ];

      expect(() => {
        processLoaderResults(settled, matches, {
          onResult() {},
          onRedirect() {},
          onRouteError() {},
          resolveHasOfflineFallback() {
            return false;
          },
        });
      }).toThrow("Failed to fetch");
    });

    test("uses generic message for non-Error network failures", () => {
      const matches = [createMatch("a")];

      const settled: LoaderSettledResult[] = [{ status: "rejected", reason: "connection refused" }];

      let errorValue: unknown;

      processLoaderResults(settled, matches, {
        onResult() {},
        onRedirect() {},
        onRouteError(_matchId, error) {
          errorValue = error;
        },
        resolveHasOfflineFallback() {
          return true;
        },
      });

      expect(errorValue).toEqual({
        kind: "fault",
        status: 0,
        headers: expect.any(Headers),
        message: "Network request failed",
      });
    });

    test("structured route errors bypass offline fallback and use normal error path", () => {
      const matches = [createMatch("a")];
      const routeError = Object.assign(new Error("Not Found"), {
        kind: "error" as const,
        status: 404,
        headers: new Headers(),
        message: "Not Found",
      });

      const settled: LoaderSettledResult[] = [{ status: "rejected", reason: routeError }];

      let errorMatchId: string | undefined;
      let errorValue: unknown;
      let fallbackChecked = false;

      processLoaderResults(settled, matches, {
        onResult() {},
        onRedirect() {},
        onRouteError(matchId, error) {
          errorMatchId = matchId;
          errorValue = error;
        },
        resolveHasOfflineFallback() {
          fallbackChecked = true;
          return true;
        },
      });

      expect(errorMatchId).toBe("a");
      expect(errorValue).toBe(routeError);
      expect(fallbackChecked).toBe(false);
    });

    test("preserveStaleOnFailure takes priority over fallback for eligible matches", () => {
      const matches = [createMatch("a")];
      const networkError = new TypeError("Failed to fetch");

      const settled: LoaderSettledResult[] = [{ status: "rejected", reason: networkError }];

      let offlineStaleMatchId: string | undefined;
      let errorMatchId: string | undefined;

      processLoaderResults(settled, matches, {
        onResult() {},
        onRedirect() {},
        onRouteError(matchId) {
          errorMatchId = matchId;
        },
        resolveOfflineEligible() {
          return true;
        },
        onOfflineStale(matchId) {
          offlineStaleMatchId = matchId;
        },
        resolveHasOfflineFallback() {
          return true;
        },
      });

      expect(offlineStaleMatchId).toBe("a");
      expect(errorMatchId).toBeUndefined();
    });
  });
});
