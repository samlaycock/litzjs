import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { useFormStatus } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { installClientBindings, resetClientBindings } from "../src/client/bindings";
import {
  createResourceComponent,
  createResourceFormComponent,
  useRequiredResourceActions,
  useRequiredResourceData,
  useRequiredResourceLocation,
  useRequiredResourceStatus,
} from "../src/client/resources";
import {
  createRouteFormComponent,
  useRequiredRouteActions,
  useRequiredRouteData,
  useRequiredRouteLocation,
  useRequiredRouteStatus,
} from "../src/client/route-runtime";
import { data, defineResource, server, type SetResourceSearchParams } from "../src/index";
import { flushDom, installTestDom } from "./test-dom";

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
};

type IsExact<T, U> =
  (<Value>() => Value extends T ? 1 : 2) extends <Value>() => Value extends U ? 1 : 2
    ? (<Value>() => Value extends U ? 1 : 2) extends <Value>() => Value extends T ? 1 : 2
      ? true
      : false
    : false;

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;

  return {
    promise: new Promise<T>((nextResolve) => {
      resolve = nextResolve;
    }),
    resolve,
  };
}

class TestErrorBoundary extends React.Component<
  { readonly children?: React.ReactNode },
  { readonly error: unknown }
> {
  override readonly state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      const error = this.state.error as { kind?: string; message?: string };

      return (
        <div
          className="resource-boundary"
          data-kind={error.kind ?? "unknown"}
          data-message={error.message ?? "unknown"}
        />
      );
    }

    return this.props.children;
  }
}

const accountResource = defineResource("/resource/account/:id", {
  component: function AccountResource() {
    const details = accountResource.useData() as { id: string; count: number } | null;
    const pending = accountResource.usePending();

    return (
      <section>
        <div className="resource-count" data-value={details?.count ?? -1} />
        <div className="resource-pending" data-value={pending ? "yes" : "no"} />
        <accountResource.Form>
          <ResourceStatusFields />
        </accountResource.Form>
      </section>
    );
  },
  loader: server(async ({ params }) => data({ id: params.id, count: 1 })),
  action: server(async ({ params }) => data({ id: params.id, count: 2 })),
});

const overlapResource = defineResource("/resource/overlap/:id", {
  component: function OverlapResource() {
    const details = overlapResource.useData() as { id: string; count: number } | null;
    const pending = overlapResource.usePending();
    const reload = overlapResource.useReload();
    const submit = overlapResource.useSubmit();
    const actionResult = overlapResource.useActionResult();
    const [submitState, setSubmitState] = React.useState("idle");

    return (
      <section>
        <div className="overlap-count" data-value={details?.count ?? -1} />
        <div className="overlap-pending" data-value={pending ? "yes" : "no"} />
        <div className="overlap-submit-state" data-value={submitState} />
        <div className="overlap-action-kind" data-value={actionResult?.kind ?? "(none)"} />
        <button type="button" className="overlap-reload" onClick={() => reload()}>
          Reload
        </button>
        <button
          type="button"
          className="overlap-submit"
          onClick={() => {
            setSubmitState("pending");
            void submit({ increment: "1" }).then(
              () => setSubmitState("resolved"),
              () => setSubmitState("rejected"),
            );
          }}
        >
          Submit
        </button>
      </section>
    );
  },
  loader: server(async ({ params }) => data({ id: params.id, count: 1 })),
  action: server(async ({ params }) => data({ id: params.id, count: 2 })),
});

const searchResource = defineResource("/resource/search/:id", {
  component: function SearchResource() {
    const [searchParams, setSearch] = searchResource.useSearch();
    const details = searchResource.useData() as { id: string; tab: string } | null;

    return (
      <section>
        <div className="search-resource-tab" data-value={searchParams.get("tab") ?? "(none)"} />
        <div className="search-resource-data-tab" data-value={details?.tab ?? "(none)"} />
        <button
          type="button"
          className="search-resource-update"
          onClick={() => setSearch({ tab: "security" })}
        >
          Update search
        </button>
      </section>
    );
  },
  loader: server(async ({ params }) => data({ id: params.id, tab: params.id })),
});

const _resourceSearchSetterMatchesPublicType: IsExact<
  ReturnType<typeof searchResource.useSearch>[1],
  SetResourceSearchParams
> = true;

const loaderErrorActionResource = defineResource("/resource/error-action/:id", {
  component: function LoaderErrorActionResource() {
    const loaderError = (loaderErrorActionResource as any).useLoaderError();
    const error = (loaderErrorActionResource as any).useError();
    const status = loaderErrorActionResource.useStatus();
    const actionResult = loaderErrorActionResource.useActionResult();
    const submit = loaderErrorActionResource.useSubmit();

    return (
      <section>
        <div className="loader-error-message" data-value={loaderError?.message ?? "(none)"} />
        <div className="merged-error-message" data-value={error?.message ?? "(none)"} />
        <div className="resource-status" data-value={status} />
        <div className="resource-action-kind" data-value={actionResult?.kind ?? "(none)"} />
        <button
          type="button"
          className="resource-submit"
          onClick={() => {
            void submit({ refresh: "1" });
          }}
        >
          Submit
        </button>
      </section>
    );
  },
  loader: server(async ({ params }) => data({ id: params.id, count: 1 })),
  action: server(async ({ params }) => data({ id: params.id, count: 2 })),
});

function ResourceStatusFields(): React.ReactElement {
  const status = useFormStatus();
  const increment = status.data?.get("increment");

  return (
    <>
      <input name="increment" defaultValue="1" />
      <button type="submit">Increment</button>
      <div className="form-pending" data-value={status.pending ? "pending" : "idle"} />
      <div
        className="form-data"
        data-value={typeof increment === "string" ? increment : "(idle)"}
      />
    </>
  );
}

function installRuntimeBindings(): void {
  installClientBindings({
    usePathname() {
      return window.location.pathname;
    },
    useLocation() {
      return {
        href: window.location.href,
        pathname: window.location.pathname,
        search: new URLSearchParams(window.location.search),
        hash: window.location.hash,
      };
    },
    useRequiredRouteLocation,
    useRequiredRouteStatus,
    useRequiredRouteData,
    useRequiredRouteActions,
    useRequiredResourceLocation,
    useRequiredResourceStatus,
    useRequiredResourceData,
    useRequiredResourceActions,
    useMatches() {
      return [];
    },
    createRouteFormComponent,
    createResourceFormComponent,
    createResourceComponent,
  });
}

describe("resource runtime", () => {
  let cleanupDom: (() => void) | null = null;
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    const dom = installTestDom("https://example.com/dashboard");
    cleanupDom = () => dom.cleanup();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    installRuntimeBindings();
    originalFetch = globalThis.fetch;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    globalThis.fetch = originalFetch;
    resetClientBindings();
    container?.remove();
    cleanupDom?.();
    cleanupDom = null;
    container = null;
    root = null;
  });

  test("resource.Form exposes pending state and identical resource instances stay in sync", async () => {
    const actionDeferred = createDeferred<Response>();
    let loaderCalls = 0;
    let actionCalls = 0;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const metadata = headers.get("x-litzjs-request");

      if (metadata) {
        actionCalls += 1;
        return actionDeferred.promise;
      }

      loaderCalls += 1;
      return Response.json({
        kind: "data",
        data: { id: "user-001", count: 1 },
      });
    }) as typeof fetch;

    await act(async () => {
      root?.render(
        <>
          <accountResource.Component params={{ id: "user-001" }} />
          <accountResource.Component params={{ id: "user-001" }} />
        </>,
      );
      await flushDom();
    });

    const forms = Array.from(container?.getElementsByTagName("form") ?? []);
    const firstButton = forms[0]?.getElementsByTagName("button")[0] ?? null;
    const resourceCounts = Array.from(document.getElementsByClassName("resource-count"));
    const resourcePendingStates = Array.from(document.getElementsByClassName("resource-pending"));
    const formPendingStates = Array.from(document.getElementsByClassName("form-pending"));
    const formDataStates = Array.from(document.getElementsByClassName("form-data"));

    expect(loaderCalls).toBe(1);
    expect(actionCalls).toBe(0);
    expect(resourceCounts.map((node) => node.getAttribute("data-value"))).toEqual(["1", "1"]);
    expect(resourcePendingStates.map((node) => node.getAttribute("data-value"))).toEqual([
      "no",
      "no",
    ]);
    expect(formPendingStates.map((node) => node.getAttribute("data-value"))).toEqual([
      "idle",
      "idle",
    ]);

    act(() => {
      (forms[0] as HTMLFormElement).requestSubmit(firstButton as HTMLButtonElement);
    });
    await flushDom();

    expect(actionCalls).toBe(1);
    expect(resourcePendingStates.map((node) => node.getAttribute("data-value"))).toEqual([
      "yes",
      "yes",
    ]);
    expect(formPendingStates.map((node) => node.getAttribute("data-value"))).toEqual([
      "pending",
      "idle",
    ]);
    expect(formDataStates.map((node) => node.getAttribute("data-value"))).toEqual(["1", "(idle)"]);

    actionDeferred.resolve(
      Response.json({
        kind: "data",
        data: { id: "user-001", count: 2 },
      }),
    );

    await act(async () => {
      await flushDom();
    });

    expect(resourceCounts.map((node) => node.getAttribute("data-value"))).toEqual(["2", "2"]);
    expect(resourcePendingStates.map((node) => node.getAttribute("data-value"))).toEqual([
      "no",
      "no",
    ]);
    expect(formPendingStates.map((node) => node.getAttribute("data-value"))).toEqual([
      "idle",
      "idle",
    ]);
  });

  test("resource store preserves entries across unmount/remount cycles", async () => {
    let loaderCalls = 0;

    globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      loaderCalls += 1;
      return Response.json({
        kind: "data",
        data: { id: "user-002", count: 1 },
      });
    }) as typeof fetch;

    function Wrapper({ mountKey }: { readonly mountKey: number }): React.ReactElement {
      return <accountResource.Component key={mountKey} params={{ id: "user-002" }} />;
    }

    // Initial mount: triggers one loader fetch
    await act(async () => {
      root?.render(<Wrapper mountKey={1} />);
      await flushDom();
    });

    expect(loaderCalls).toBe(1);
    expect(document.querySelector(".resource-count")?.getAttribute("data-value")).toBe("1");

    // Change key to force a full unmount/remount of the resource component.
    // This exercises the same unsubscribe/resubscribe path that React strict
    // mode triggers (albeit via a different mechanism — key change forces a new
    // instance, whereas strict mode double-invokes effects on the same instance).
    await act(async () => {
      root?.render(<Wrapper mountKey={2} />);
      await flushDom();
    });

    // The loader should NOT be called again — the cached entry should survive
    expect(loaderCalls).toBe(1);
    expect(document.querySelector(".resource-count")?.getAttribute("data-value")).toBe("1");
  });

  test("treats repeated query params as part of the resource cache key", async () => {
    const loaderBodies: string[] = [];

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as string;

      if (!body) {
        throw new Error("Expected loader request body.");
      }

      loaderBodies.push(body);

      return Response.json({
        kind: "data",
        data: { id: "user-003", count: loaderBodies.length },
      });
    }) as typeof fetch;

    await act(async () => {
      root?.render(
        <>
          <accountResource.Component
            params={{ id: "user-003" }}
            search={new URLSearchParams("tag=framework&tag=bun")}
          />
          <accountResource.Component params={{ id: "user-003" }} search={{ tag: "bun" }} />
        </>,
      );
      await flushDom();
    });

    expect(loaderBodies).toHaveLength(2);
    expect(loaderBodies.map((body) => JSON.parse(body).request.search)).toEqual([
      { tag: ["framework", "bun"] },
      { tag: "bun" },
    ]);
  });

  test("resource.useSearch() updates request-scoped search state without touching browser history", async () => {
    const loaderBodies: string[] = [];

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as string;

      if (!body) {
        throw new Error("Expected loader request body.");
      }

      loaderBodies.push(body);
      const request = JSON.parse(body).request as {
        params: { id: string };
        search: { tab?: string };
      };

      return Response.json({
        kind: "data",
        data: {
          id: request.params.id,
          tab: request.search.tab ?? "profile",
        },
      });
    }) as typeof fetch;

    await act(async () => {
      root?.render(
        <searchResource.Component params={{ id: "user-004" }} search={{ tab: "profile" }} />,
      );
      await flushDom();
    });

    const updateButton = document.querySelector(".search-resource-update");

    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(1);
    expect(document.querySelector(".search-resource-tab")?.getAttribute("data-value")).toBe(
      "profile",
    );
    expect(document.querySelector(".search-resource-data-tab")?.getAttribute("data-value")).toBe(
      "profile",
    );
    expect(loaderBodies.map((body) => JSON.parse(body).request.search)).toEqual([
      { tab: "profile" },
    ]);

    await act(async () => {
      (updateButton as HTMLButtonElement).click();
      await flushDom();
    });

    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(1);
    expect(document.querySelector(".search-resource-tab")?.getAttribute("data-value")).toBe(
      "security",
    );
    expect(document.querySelector(".search-resource-data-tab")?.getAttribute("data-value")).toBe(
      "security",
    );
    expect(loaderBodies.map((body) => JSON.parse(body).request.search)).toEqual([
      { tab: "profile" },
      { tab: "security" },
    ]);
  });

  test("keeps action submits distinct from a pending loader refresh for the same resource", async () => {
    const loaderRefreshDeferred = createDeferred<Response>();
    const actionDeferred = createDeferred<Response>();
    let loaderCalls = 0;
    let actionCalls = 0;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const metadata = headers.get("x-litzjs-request");

      if (metadata) {
        actionCalls += 1;
        return actionDeferred.promise;
      }

      loaderCalls += 1;

      if (loaderCalls === 1) {
        return Response.json({
          kind: "data",
          data: { id: "user-004", count: 1 },
        });
      }

      return loaderRefreshDeferred.promise;
    }) as typeof fetch;

    await act(async () => {
      root?.render(<overlapResource.Component params={{ id: "user-004" }} />);
      await flushDom();
    });

    const reloadButton = document.querySelector(".overlap-reload");
    const submitButton = document.querySelector(".overlap-submit");

    expect(loaderCalls).toBe(1);
    expect(actionCalls).toBe(0);
    expect(document.querySelector(".overlap-count")?.getAttribute("data-value")).toBe("1");

    act(() => {
      (reloadButton as HTMLButtonElement).click();
    });
    await flushDom();

    expect(loaderCalls).toBe(2);
    expect(document.querySelector(".overlap-pending")?.getAttribute("data-value")).toBe("yes");
    expect(document.querySelector(".overlap-submit-state")?.getAttribute("data-value")).toBe(
      "idle",
    );

    act(() => {
      (submitButton as HTMLButtonElement).click();
    });
    await flushDom();

    expect(actionCalls).toBe(1);
    expect(document.querySelector(".overlap-pending")?.getAttribute("data-value")).toBe("yes");
    expect(document.querySelector(".overlap-submit-state")?.getAttribute("data-value")).toBe(
      "pending",
    );

    loaderRefreshDeferred.resolve(
      Response.json({
        kind: "data",
        data: { id: "user-004", count: 3 },
      }),
    );

    await act(async () => {
      await flushDom();
    });

    expect(document.querySelector(".overlap-count")?.getAttribute("data-value")).toBe("3");
    expect(document.querySelector(".overlap-pending")?.getAttribute("data-value")).toBe("yes");
    expect(document.querySelector(".overlap-submit-state")?.getAttribute("data-value")).toBe(
      "pending",
    );
    expect(document.querySelector(".overlap-action-kind")?.getAttribute("data-value")).toBe(
      "(none)",
    );

    actionDeferred.resolve(
      Response.json({
        kind: "data",
        data: { id: "user-004", count: 4 },
      }),
    );

    await act(async () => {
      await flushDom();
    });

    expect(document.querySelector(".overlap-count")?.getAttribute("data-value")).toBe("4");
    expect(document.querySelector(".overlap-pending")?.getAttribute("data-value")).toBe("no");
    expect(document.querySelector(".overlap-submit-state")?.getAttribute("data-value")).toBe(
      "resolved",
    );
    expect(document.querySelector(".overlap-action-kind")?.getAttribute("data-value")).toBe("data");
  });

  test("preserves a concurrent action fault when a loader succeeds afterward", async () => {
    const loaderRefreshDeferred = createDeferred<Response>();
    const actionDeferred = createDeferred<Response>();
    const originalConsoleError = console.error;
    let loaderCalls = 0;

    console.error = () => {};

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const metadata = headers.get("x-litzjs-request");

      if (metadata) {
        return actionDeferred.promise;
      }

      loaderCalls += 1;

      if (loaderCalls === 1) {
        return Response.json({
          kind: "data",
          data: { id: "user-005", count: 1 },
        });
      }

      return loaderRefreshDeferred.promise;
    }) as typeof fetch;

    try {
      await act(async () => {
        root?.render(
          <TestErrorBoundary>
            <overlapResource.Component params={{ id: "user-005" }} />
          </TestErrorBoundary>,
        );
        await flushDom();
      });

      act(() => {
        (document.querySelector(".overlap-reload") as HTMLButtonElement).click();
      });
      await flushDom();

      act(() => {
        (document.querySelector(".overlap-submit") as HTMLButtonElement).click();
      });

      actionDeferred.resolve(
        Response.json(
          {
            kind: "fault",
            message: "database unavailable",
          },
          { status: 500 },
        ),
      );
      loaderRefreshDeferred.resolve(
        Response.json({
          kind: "data",
          data: { id: "user-005", count: 3 },
        }),
      );

      await act(async () => {
        await flushDom();
      });

      expect(document.querySelector(".resource-boundary")?.getAttribute("data-kind")).toBe("fault");
      expect(document.querySelector(".resource-boundary")?.getAttribute("data-message")).toBe(
        "database unavailable",
      );
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("keeps loader errors source-scoped after a later successful action", async () => {
    let loaderCalls = 0;
    let actionCalls = 0;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const metadata = headers.get("x-litzjs-request");

      if (metadata) {
        actionCalls += 1;
        return Response.json({
          kind: "data",
          data: { id: "user-006", count: 2 },
        });
      }

      loaderCalls += 1;
      return Response.json(
        {
          kind: "error",
          message: "Loader not found",
        },
        { status: 404 },
      );
    }) as typeof fetch;

    await act(async () => {
      root?.render(<loaderErrorActionResource.Component params={{ id: "user-006" }} />);
      await flushDom();
    });

    expect(loaderCalls).toBe(1);
    expect(document.querySelector(".loader-error-message")?.getAttribute("data-value")).toBe(
      "Loader not found",
    );
    expect(document.querySelector(".merged-error-message")?.getAttribute("data-value")).toBe(
      "Loader not found",
    );
    expect(document.querySelector(".resource-status")?.getAttribute("data-value")).toBe("error");

    await act(async () => {
      (document.querySelector(".resource-submit") as HTMLButtonElement).click();
      await flushDom();
    });

    expect(actionCalls).toBe(1);
    expect(document.querySelector(".loader-error-message")?.getAttribute("data-value")).toBe(
      "Loader not found",
    );
    expect(document.querySelector(".merged-error-message")?.getAttribute("data-value")).toBe(
      "(none)",
    );
    expect(document.querySelector(".resource-status")?.getAttribute("data-value")).toBe("idle");
    expect(document.querySelector(".resource-action-kind")?.getAttribute("data-value")).toBe(
      "data",
    );
  });
});
