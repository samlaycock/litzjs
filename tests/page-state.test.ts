import { describe, expect, test } from "bun:test";

import { resolveSettledPageStatus, withIdleState } from "../src/client/page-state";
import { error, fault } from "../src/index";

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

describe("resolveSettledPageStatus", () => {
  test("ignores stale action errors when a loader settles successfully after reload", () => {
    const result = resolveSettledPageStatus(
      {
        matchStates: {
          route: {
            loaderResult: {
              kind: "data",
              status: 200,
              headers: new Headers(),
              stale: false,
              data: { ok: true },
              render() {
                return null;
              },
            },
          },
        },
        actionResult: {
          ...error(422, "Invalid input"),
          headers: new Headers(),
        },
      },
      {
        includeActionResult: false,
      },
    );

    expect(result).toBe("idle");
  });

  test("treats active layout loader errors as page error state", () => {
    const result = resolveSettledPageStatus({
      matchStates: {
        layout: {
          loaderResult: {
            ...error(404, "Layout missing"),
            headers: new Headers(),
            stale: false,
          },
        },
        route: {
          loaderResult: {
            kind: "data",
            status: 200,
            headers: new Headers(),
            stale: false,
            data: { ok: true },
            render() {
              return null;
            },
          },
        },
      },
      actionResult: null,
    });

    expect(result).toBe("error");
  });

  test("treats explicit action faults as error state by default", () => {
    const result = resolveSettledPageStatus({
      matchStates: {
        route: {
          loaderResult: null,
        },
      },
      actionResult: {
        ...fault(500, "Boom"),
        headers: new Headers(),
      },
    });

    expect(result).toBe("error");
  });

  test("can ignore stale action faults when reload settles without loaders", () => {
    const result = resolveSettledPageStatus(
      {
        matchStates: {
          route: {
            loaderResult: null,
          },
        },
        actionResult: {
          ...fault(500, "Boom"),
          headers: new Headers(),
        },
      },
      {
        includeActionResult: false,
      },
    );

    expect(result).toBe("idle");
  });

  test("ignores stale route loader errors when a later action succeeds", () => {
    const result = resolveSettledPageStatus(
      {
        matchStates: {
          layout: {
            loaderResult: {
              kind: "data",
              status: 200,
              headers: new Headers(),
              stale: false,
              data: { layout: true },
              render() {
                return null;
              },
            },
          },
          route: {
            loaderResult: {
              ...error(404, "Project not found"),
              headers: new Headers(),
              stale: false,
            },
          },
        },
        actionResult: {
          kind: "view",
          status: 200,
          headers: new Headers(),
          node: null,
          render() {
            return null;
          },
        },
      },
      {
        ignoreLoaderMatchIds: ["route"],
      },
    );

    expect(result).toBe("idle");
  });

  test("still reports error when only a parent layout loader is in error", () => {
    const result = resolveSettledPageStatus(
      {
        matchStates: {
          layout: {
            loaderResult: {
              ...error(404, "Layout missing"),
              headers: new Headers(),
              stale: false,
            },
          },
          route: {
            loaderResult: {
              ...error(404, "Project not found"),
              headers: new Headers(),
              stale: false,
            },
          },
        },
        actionResult: {
          kind: "view",
          status: 200,
          headers: new Headers(),
          node: null,
          render() {
            return null;
          },
        },
      },
      {
        ignoreLoaderMatchIds: ["route"],
      },
    );

    expect(result).toBe("error");
  });
});
