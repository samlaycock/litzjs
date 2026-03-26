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
import { data, defineResource, server } from "../src/index";
import { flushDom, installTestDom } from "./test-dom";

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;

  return {
    promise: new Promise<T>((nextResolve) => {
      resolve = nextResolve;
    }),
    resolve,
  };
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

  test("resource store preserves entries across unmount/remount cycles (strict mode)", async () => {
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

    // Change key to force unmount/remount of the resource component.
    // This simulates the unsubscribe/resubscribe cycle that occurs
    // during React strict mode or concurrent rendering transitions.
    await act(async () => {
      root?.render(<Wrapper mountKey={2} />);
      await flushDom();
    });

    // The loader should NOT be called again — the cached entry should survive
    expect(loaderCalls).toBe(1);
    expect(document.querySelector(".resource-count")?.getAttribute("data-value")).toBe("1");
  });
});
