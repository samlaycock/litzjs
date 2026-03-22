import * as React from "react";

import type {
  LoaderHookResult,
  ResourceActionState,
  ResourceLoaderState,
  ResourceRequest,
} from "../index";

import { createInternalActionRequestInit, VOLT_RESULT_ACCEPT } from "../server/internal-requests";
import { parseActionResponse, parseLoaderResponse, serializePayload } from "./transport";

type ResourceSnapshot = {
  result?: LoaderHookResult;
  loading: boolean;
  error?: Error;
};

type ResourceStoreEntry = {
  snapshot: ResourceSnapshot;
  listeners: Set<() => void>;
  inFlight?: Promise<void>;
};

type NormalizedResourceRequest = {
  params: Record<string, string>;
  search: Record<string, string>;
};

type PreparedResourceRequest = {
  key: string;
  normalizedRequest: NormalizedResourceRequest;
};

const RESOURCE_STORE_LIMIT = 200;
const resourceStore = new Map<string, ResourceStoreEntry>();

export function useResourceLoader(
  resourcePath: string,
  request?: ResourceRequest,
): ResourceLoaderState {
  const preparedRequest = React.useMemo(
    () => prepareResourceRequest(resourcePath, request),
    [resourcePath, request],
  );

  const snapshot = React.useSyncExternalStore(
    React.useCallback(
      (listener: () => void) => subscribe(preparedRequest.key, listener),
      [preparedRequest.key],
    ),
    React.useCallback(() => getEntry(preparedRequest.key).snapshot, [preparedRequest.key]),
    React.useCallback(() => getEntry(preparedRequest.key).snapshot, [preparedRequest.key]),
  );

  const load = React.useCallback(
    async (nextRequest?: ResourceRequest) => {
      if (nextRequest) {
        await performResourceRequest(resourcePath, "loader", undefined, nextRequest);
        return;
      }

      await performPreparedResourceRequest(resourcePath, "loader", preparedRequest);
    },
    [preparedRequest, resourcePath],
  );

  React.useEffect(() => {
    if (!snapshot.loading && !snapshot.result && !snapshot.error) {
      void load();
    }
  }, [load, snapshot.error, snapshot.loading, snapshot.result]);

  if (snapshot.error) {
    throw snapshot.error;
  }

  const render = React.useCallback(() => snapshot.result?.render() ?? null, [snapshot.result]);

  return React.useMemo(
    () => ({
      kind: snapshot.result?.kind,
      data: snapshot.result?.kind === "data" ? snapshot.result.data : undefined,
      node: snapshot.result?.kind === "view" ? snapshot.result.node : undefined,
      render,
      load,
    }),
    [load, render, snapshot.result],
  );
}

export function useResourceAction(
  resourcePath: string,
  request?: ResourceRequest,
): ResourceActionState {
  const preparedRequest = React.useMemo(
    () => prepareResourceRequest(resourcePath, request),
    [resourcePath, request],
  );

  return React.useMemo(
    () => ({
      submit: async (
        payload: FormData | Record<string, unknown>,
        nextRequest?: ResourceRequest,
      ) => {
        if (nextRequest) {
          await performResourceRequest(resourcePath, "action", payload, nextRequest);
          return;
        }

        await performPreparedResourceRequest(resourcePath, "action", preparedRequest, payload);
      },
    }),
    [preparedRequest, resourcePath],
  );
}

async function performResourceRequest(
  resourcePath: string,
  operation: "loader" | "action",
  payload?: FormData | Record<string, unknown>,
  request?: ResourceRequest,
): Promise<void> {
  return performPreparedResourceRequest(
    resourcePath,
    operation,
    prepareResourceRequest(resourcePath, request),
    payload,
  );
}

async function performPreparedResourceRequest(
  resourcePath: string,
  operation: "loader" | "action",
  preparedRequest: PreparedResourceRequest,
  payload?: FormData | Record<string, unknown>,
): Promise<void> {
  const { key, normalizedRequest } = preparedRequest;
  const entry = getEntry(key);

  if (entry.inFlight) {
    return entry.inFlight;
  }

  entry.snapshot = {
    ...entry.snapshot,
    loading: true,
    error: undefined,
  };
  notify(entry);

  entry.inFlight = (async () => {
    try {
      const response =
        operation === "action"
          ? await fetch("/_volt/resource", {
              method: "POST",
              ...createInternalActionRequestInit(
                {
                  path: resourcePath,
                  operation,
                  request: {
                    params: normalizedRequest.params,
                    search: normalizedRequest.search,
                  },
                },
                payload,
              ),
            })
          : await fetch("/_volt/resource", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: VOLT_RESULT_ACCEPT,
              },
              body: JSON.stringify({
                path: resourcePath,
                operation,
                request: {
                  params: normalizedRequest.params,
                  search: normalizedRequest.search,
                },
                payload: serializePayload(payload),
              }),
            });

      if (operation === "loader") {
        const loaderResult = await parseLoaderResponse(response);
        entry.snapshot = {
          result: loaderResult,
          loading: false,
        };
      } else {
        const actionResult = await parseActionResponse(response);

        if (actionResult?.kind === "view") {
          entry.snapshot = {
            result: {
              kind: "view",
              status: actionResult.status,
              headers: actionResult.headers,
              stale: false,
              node: actionResult.node,
              render: actionResult.render,
            },
            loading: false,
          };
        } else {
          entry.snapshot = {
            ...entry.snapshot,
            loading: false,
          };
        }
      }
    } catch (error) {
      entry.snapshot = {
        ...entry.snapshot,
        loading: false,
        error: error instanceof Error ? error : new Error("Resource request failed."),
      };
      throw entry.snapshot.error;
    } finally {
      entry.inFlight = undefined;
      notify(entry);
      cleanupResourceEntry(key, entry);
    }
  })();

  return entry.inFlight;
}

function normalizeResourceRequest(request?: ResourceRequest): NormalizedResourceRequest {
  const params = request?.params ?? {};
  const search = request?.search
    ? request.search instanceof URLSearchParams
      ? Object.fromEntries(request.search.entries())
      : request.search
    : {};

  return {
    params,
    search,
  };
}

function prepareResourceRequest(
  resourcePath: string,
  request?: ResourceRequest,
): PreparedResourceRequest {
  const normalizedRequest = normalizeResourceRequest(request);

  return {
    key: createResourceCacheKey(resourcePath, normalizedRequest),
    normalizedRequest,
  };
}

function createResourceCacheKey(
  resourcePath: string,
  normalizedRequest: NormalizedResourceRequest,
): string {
  return JSON.stringify({
    path: resourcePath,
    params: sortRecord(normalizedRequest.params),
    search: sortRecord(normalizedRequest.search),
  });
}

function sortRecord(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function subscribe(key: string, listener: () => void): () => void {
  const entry = getEntry(key);
  entry.listeners.add(listener);

  return () => {
    entry.listeners.delete(listener);
    cleanupResourceEntry(key, entry);
  };
}

function getEntry(key: string): ResourceStoreEntry {
  let entry = resourceStore.get(key);

  if (!entry) {
    entry = {
      snapshot: {
        loading: false,
      },
      listeners: new Set(),
    };
    resourceStore.set(key, entry);
    pruneResourceStore();
  }

  return entry;
}

function notify(entry: ResourceStoreEntry): void {
  for (const listener of entry.listeners) {
    listener();
  }
}

function cleanupResourceEntry(key: string, entry: ResourceStoreEntry): void {
  if (entry.listeners.size > 0 || entry.inFlight || entry.snapshot.loading) {
    return;
  }

  resourceStore.delete(key);
}

function pruneResourceStore(): void {
  if (resourceStore.size <= RESOURCE_STORE_LIMIT) {
    return;
  }

  for (const [key, entry] of resourceStore) {
    if (resourceStore.size <= RESOURCE_STORE_LIMIT) {
      return;
    }

    cleanupResourceEntry(key, entry);
  }
}
