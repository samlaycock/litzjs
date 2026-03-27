import type { LoaderHookResult } from "../index";

import { isAbortError } from "./abort-error";
import { fetchRouteLoader, fetchRouteLoaders, isRedirectSignal, isRouteLikeError } from "./runtime";

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
  if (matches.length <= 1) {
    return fetchRouteLoadersIndividually(matches, context);
  }

  try {
    const settled = await fetchRouteLoaders(
      context.routePath,
      context.baseRequest,
      matches.map((match) => match.id),
      context.signal,
    );

    if (settled.length !== matches.length) {
      throw new Error("Batched route loader response length did not match the requested targets.");
    }

    return settled.map((result, index) => {
      if (result.status === "rejected") {
        return result;
      }

      return {
        status: "fulfilled",
        value: {
          match: matches[index]!,
          loaderResult: result.value,
        },
      } satisfies PromiseFulfilledResult<LoaderSettledEntry>;
    });
  } catch (error) {
    if (isAbortError(error)) {
      return matches.map(() => {
        return {
          status: "rejected",
          reason: error,
        } satisfies PromiseRejectedResult;
      });
    }

    return fetchRouteLoadersIndividually(matches, context);
  }
}

async function fetchRouteLoadersIndividually(
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
  if (callbacks.isCancelled?.()) {
    return;
  }

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

      if (callbacks.resolveOfflineEligible?.(matchId)) {
        callbacks.onOfflineStale?.(matchId);
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
