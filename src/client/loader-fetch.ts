import type { LoaderHookResult } from "../index";

import { fetchRouteLoader, isRedirectSignal, isRouteLikeError } from "./runtime";

interface LoaderMatch {
  readonly id: string;
  readonly cacheKey: string;
}

interface LoaderFetchContext {
  readonly routePath: string;
  readonly baseRequest: {
    readonly params: Record<string, string>;
    readonly search: URLSearchParams;
  };
  readonly signal?: AbortSignal;
}

interface LoaderSettledEntry {
  readonly match: LoaderMatch;
  readonly loaderResult: LoaderHookResult;
}

export type LoaderSettledResult = PromiseSettledResult<LoaderSettledEntry>;

export async function fetchRouteLoadersInParallel(
  matches: readonly LoaderMatch[],
  context: LoaderFetchContext,
): Promise<readonly LoaderSettledResult[]> {
  return Promise.allSettled(
    matches.map((match) =>
      fetchRouteLoader(context.routePath, context.baseRequest, match.id, context.signal).then(
        (loaderResult) => ({
          match,
          loaderResult,
        }),
      ),
    ),
  );
}

export function processLoaderResults(
  settled: readonly LoaderSettledResult[],
  matches: readonly LoaderMatch[],
  callbacks: {
    isCancelled?: () => boolean;
    onResult: (match: LoaderMatch, loaderResult: LoaderHookResult) => void;
    onRedirect: (location: string) => void;
    onRouteError: (matchId: string, error: unknown) => void;
    resolveOfflineEligible?: (matchId: string) => boolean;
    onOfflineStale?: (matchId: string) => void;
    resolveHasOfflineFallback?: (matchId: string) => boolean;
  },
): void {
  for (const [index, result] of settled.entries()) {
    if (callbacks.isCancelled?.()) {
      return;
    }

    if (result.status === "rejected") {
      const error: unknown = result.reason;

      if (isRedirectSignal(error)) {
        callbacks.onRedirect(error.location);
        return;
      }

      const matchId = matches[index]!.id;

      if (callbacks.resolveOfflineEligible?.(matchId) && callbacks.onOfflineStale) {
        callbacks.onOfflineStale(matchId);
        continue;
      }

      if (isRouteLikeError(error)) {
        callbacks.onRouteError(matchId, error);
        return;
      }

      if (callbacks.resolveHasOfflineFallback?.(matchId)) {
        callbacks.onRouteError(matchId, {
          kind: "fault" as const,
          status: 0,
          headers: new Headers(),
          message: error instanceof Error ? error.message : "Network request failed",
        });
        return;
      }

      throw error;
    }

    callbacks.onResult(result.value.match, result.value.loaderResult);
  }
}
