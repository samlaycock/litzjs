import { describe, expect, mock, test } from "bun:test";

import {
  dispatchClientDefinitionHotUpdate,
  getBrowserHotUpdatedFiles,
  shouldRefreshRouteModuleFromRscUpdate,
  subscribeToRscHotUpdates,
} from "../src/client/hmr";

describe("client HMR helpers", () => {
  test("subscribes to rsc:update events", () => {
    const listeners = new Map<string, Set<() => void>>();
    const on = mock((event: string, listener: () => void) => {
      const eventListeners = listeners.get(event) ?? new Set<() => void>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    });
    const off = mock((event: string, listener: () => void) => {
      listeners.get(event)?.delete(listener);
    });
    const handleUpdate = mock(() => {});
    const cleanup = subscribeToRscHotUpdates(
      {
        on,
        off,
      },
      handleUpdate,
    );

    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith("rsc:update", expect.any(Function));

    listeners.get("rsc:update")?.forEach((listener) => listener());

    expect(handleUpdate).toHaveBeenCalledTimes(1);

    cleanup?.();

    expect(off).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledWith("rsc:update", expect.any(Function));
    expect(listeners.get("rsc:update")?.size ?? 0).toBe(0);
  });

  test("returns without subscribing when HMR is unavailable", () => {
    const handleUpdate = mock(() => {});

    const cleanup = subscribeToRscHotUpdates(undefined, handleUpdate);

    expect(cleanup).toBeUndefined();
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  test("dispatches client definition hot updates through the global handler", () => {
    const handler = mock(() => {});
    globalThis.__litzjsHandleClientDefinitionHotUpdate = handler;

    try {
      dispatchClientDefinitionHotUpdate({
        kind: "route",
        definition: {
          id: "home",
        },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        kind: "route",
        definition: {
          id: "home",
        },
      });
    } finally {
      delete globalThis.__litzjsHandleClientDefinitionHotUpdate;
    }
  });

  test("does not refresh route modules from rsc:update when the changed file is browser-hmr-owned", () => {
    expect(
      shouldRefreshRouteModuleFromRscUpdate(
        {
          file: "/app/src/routes/index.tsx",
        },
        new Set(["/app/src/routes/index.tsx"]),
      ),
    ).toBe(false);
  });

  test("refreshes route modules from rsc:update when the changed file is not a manifest route module", () => {
    expect(
      shouldRefreshRouteModuleFromRscUpdate(
        {
          file: "/app/src/server/query.ts",
        },
        new Set(["/app/src/routes/index.tsx"]),
      ),
    ).toBe(true);
  });

  test("does not refresh route modules from rsc:update when browser HMR already owns the file", () => {
    expect(
      shouldRefreshRouteModuleFromRscUpdate(
        {
          file: "/app/src/components/card.tsx",
        },
        new Set(["/app/src/routes/index.tsx"]),
        new Set(["/app/src/components/card.tsx"]),
      ),
    ).toBe(false);
  });

  test("maps vite:beforeUpdate client paths back to absolute source files", () => {
    expect(
      getBrowserHotUpdatedFiles(
        {
          updates: [
            {
              path: "/src/components/card.tsx?t=123",
              acceptedPath: "/src/routes/index.tsx?t=123",
            },
          ],
        },
        "/app",
      ),
    ).toEqual(new Set(["/app/src/components/card.tsx", "/app/src/routes/index.tsx"]));
  });

  test("maps vite:beforeUpdate paths for non-src project layouts back to absolute source files", () => {
    expect(
      getBrowserHotUpdatedFiles(
        {
          updates: [
            {
              path: "/app/components/card.tsx?t=123",
              acceptedPath: "/app/routes/index.tsx?t=123",
            },
          ],
        },
        "/project",
      ),
    ).toEqual(new Set(["/project/app/components/card.tsx", "/project/app/routes/index.tsx"]));
  });
});
