import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { useFormStatus } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import type { RouteRuntimeState } from "../src/client/route-runtime";

import { RouteRuntimeProvider, createRouteFormComponent } from "../src/client/route-runtime";
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
      id: "/projects",
      params: {},
      search: new URLSearchParams(),
      setSearch() {},
      status: "idle",
      pending: false,
      loaderResult: null,
      actionResult: null,
      view: null,
      async submit(payload) {
        submittedPayload = payload as FormData;
        await submitDeferred.promise;
      },
      reload() {},
      retry() {},
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
});
