import { describe, expect, test } from "bun:test";

import { withIdleState } from "../src/client/page-state";

describe("withIdleState", () => {
  test("clears stale offline and error state while preserving unrelated data", () => {
    const result = withIdleState({
      matchStates: {
        route: {
          loaderResult: null,
        },
      },
      actionResult: null,
      nextResultSequence: 3,
      latestDataResult: {
        sequence: 2,
        result: {
          kind: "data" as const,
          status: 200,
          headers: new Headers(),
          data: { ok: true },
        },
      },
      latestViewResult: null,
      status: "offline-stale",
      pending: true,
      errorInfo: {
        kind: "fault" as const,
        status: 0,
        headers: new Headers(),
        message: "offline",
      },
      errorTargetId: "route",
      offlineStaleMatchIds: new Set(["route"]),
    });

    expect(result.status).toBe("idle");
    expect(result.pending).toBe(false);
    expect(result.errorInfo).toBeUndefined();
    expect(result.errorTargetId).toBeUndefined();
    expect(result.offlineStaleMatchIds).toBeUndefined();
    expect(result.nextResultSequence).toBe(3);
    expect(result.latestDataResult?.result).toMatchObject({
      kind: "data",
      data: { ok: true },
    });
    expect(result.matchStates).toEqual({
      route: {
        loaderResult: null,
      },
    });
  });
});
