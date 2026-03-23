import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { useFormStatus } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import type { RouteRuntimeState } from "../src/client/route-runtime";

import {
  RouteRuntimeProvider,
  createRouteFormComponent,
  useRequiredRouteData,
} from "../src/client/route-runtime";
import { flushDom, installTestDom } from "./test-dom";

type Deferred = {
  promise: Promise<void>;
  resolve(): void;
};

function createDeferred(): Deferred {
  let resolve!: () => void;

  return {
    promise: new Promise<void>((nextResolve) => {
      resolve = nextResolve;
    }),
    resolve,
  };
}

function createRuntimeState(): RouteRuntimeState {
  return {
    id: "/projects",
    params: {},
    search: new URLSearchParams(),
    setSearch() {},
    status: "idle",
    pending: false,
    loaderResult: null,
    actionResult: null,
    data: null,
    view: null,
    async submit() {},
    reload() {},
    retry() {},
  };
}

describe("route form runtime", () => {
  let cleanupDom: (() => void) | null = null;
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    const dom = installTestDom();
    cleanupDom = () => dom.cleanup();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    cleanupDom?.();
    cleanupDom = null;
    container = null;
    root = null;
  });

  test("route.Form exposes pending and form data through useFormStatus()", async () => {
    const submitDeferred = createDeferred();
    let submittedPayload: unknown = null;
    const Form = createRouteFormComponent("/projects");

    const runtime: RouteRuntimeState = {
      ...createRuntimeState(),
      async submit(payload) {
        submittedPayload = payload as FormData;
        await submitDeferred.promise;
      },
    };

    function StatusFields() {
      const status = useFormStatus();
      const pendingValue = status.data?.get("message");

      return (
        <>
          <input name="message" defaultValue="Ship Volt" />
          <button type="submit">Save</button>
          <div id="pending-status" data-value={status.pending ? "pending" : "idle"} />
          <div
            id="pending-data"
            data-value={typeof pendingValue === "string" ? pendingValue : "(idle)"}
          />
        </>
      );
    }

    await act(async () => {
      root?.render(
        <RouteRuntimeProvider value={runtime}>
          <Form>
            <StatusFields />
          </Form>
        </RouteRuntimeProvider>,
      );
    });

    const form = container?.getElementsByTagName("form")[0] ?? null;
    const submitButton = container?.getElementsByTagName("button")[0] ?? null;
    const pendingOutput = document.getElementById("pending-status");
    const dataOutput = document.getElementById("pending-data");

    expect(form).not.toBeNull();
    expect(submitButton).not.toBeNull();
    expect(pendingOutput?.getAttribute("data-value")).toBe("idle");
    expect(dataOutput?.getAttribute("data-value")).toBe("(idle)");

    act(() => {
      (form as HTMLFormElement).requestSubmit(submitButton as HTMLButtonElement);
    });
    await flushDom();

    expect(pendingOutput?.getAttribute("data-value")).toBe("pending");
    expect(dataOutput?.getAttribute("data-value")).toBe("Ship Volt");
    expect(submittedPayload).toBeInstanceOf(FormData);
    const submittedMessage =
      submittedPayload instanceof FormData ? submittedPayload.get("message") : null;
    expect(submittedMessage).toBe("Ship Volt");

    submitDeferred.resolve();
    await act(async () => {
      await flushDom();
    });

    const settledPendingOutput = document.getElementById("pending-status");
    const settledDataOutput = document.getElementById("pending-data");

    expect(settledPendingOutput?.getAttribute("data-value")).toBe("idle");
    expect(settledDataOutput?.getAttribute("data-value")).toBe("(idle)");
  });

  test("route.Form subtree does not rerender on loader/view-only changes when children do not subscribe", async () => {
    const Form = createRouteFormComponent("/projects");
    const MemoForm = React.memo(Form);
    let setRuntimeState!: React.Dispatch<React.SetStateAction<RouteRuntimeState>>;
    const staticChildren = <button type="submit">Save</button>;

    function Harness(): React.ReactElement {
      const [runtimeState, setRuntime] = React.useState(() => createRuntimeState());
      setRuntimeState = setRuntime;

      return (
        <RouteRuntimeProvider value={runtimeState}>
          <MemoForm>{staticChildren}</MemoForm>
        </RouteRuntimeProvider>
      );
    }

    await act(async () => {
      root?.render(<Harness />);
      await flushDom();
    });

    const initialForm = container?.getElementsByTagName("form")[0] ?? null;
    const initialButton = container?.getElementsByTagName("button")[0] ?? null;
    expect(initialForm).not.toBeNull();
    expect(initialButton).not.toBeNull();

    await act(async () => {
      setRuntimeState((current) => {
        const view = <span id="loaded-view">Loaded view</span>;

        return {
          ...current,
          loaderResult: {
            kind: "view",
            status: 200,
            headers: new Headers(),
            stale: false,
            node: view,
            render() {
              return view;
            },
          },
          view,
        };
      });
      await flushDom();
    });

    const settledForm = container?.getElementsByTagName("form")[0] ?? null;
    const settledButton = container?.getElementsByTagName("button")[0] ?? null;
    expect(settledForm).toBe(initialForm);
    expect(settledButton).toBe(initialButton);
    expect(document.getElementById("loaded-view")).toBeNull();
  });

  test("route.Form subtree rerenders when a child subscribes to route data", async () => {
    const Form = createRouteFormComponent("/projects");
    const MemoForm = React.memo(Form);
    let setRuntimeState!: React.Dispatch<React.SetStateAction<RouteRuntimeState>>;
    let formCommitCount = 0;

    function SubscribedFields(): React.ReactElement {
      const data = useRequiredRouteData("/projects");

      return (
        <>
          <button type="submit">Save</button>
          <div id="view-state" data-value={data.view ? "present" : "empty"}>
            {data.view}
          </div>
        </>
      );
    }
    const staticChildren = <SubscribedFields />;

    function Harness(): React.ReactElement {
      const [runtimeState, setRuntime] = React.useState(() => createRuntimeState());
      setRuntimeState = setRuntime;

      return (
        <RouteRuntimeProvider value={runtimeState}>
          <React.Profiler
            id="form-subtree"
            onRender={() => {
              formCommitCount += 1;
            }}
          >
            <MemoForm>{staticChildren}</MemoForm>
          </React.Profiler>
        </RouteRuntimeProvider>
      );
    }

    await act(async () => {
      root?.render(<Harness />);
      await flushDom();
    });

    expect(formCommitCount).toBe(1);
    expect(document.getElementById("view-state")?.getAttribute("data-value")).toBe("empty");

    await act(async () => {
      setRuntimeState((current) => {
        const view = <span id="subscribed-view">Loaded view</span>;

        return {
          ...current,
          loaderResult: {
            kind: "view",
            status: 200,
            headers: new Headers(),
            stale: false,
            node: view,
            render() {
              return view;
            },
          },
          view,
        };
      });
      await flushDom();
    });

    expect(formCommitCount).toBe(2);
    expect(document.getElementById("view-state")?.getAttribute("data-value")).toBe("present");
    expect(document.getElementById("subscribed-view")?.textContent).toBe("Loaded view");
  });
});
