import { afterEach, describe, expect, test } from "bun:test";

import {
  getClientBindings,
  installClientBindings,
  resetClientBindings,
  type LitzClientBindings,
} from "../src/client/bindings";

function createBindings(): LitzClientBindings {
  return {
    usePathname() {
      return "/";
    },
    useLocation() {
      return {
        href: "http://localhost/",
        pathname: "/",
        search: new URLSearchParams(),
        hash: "",
      };
    },
    useRequiredRouteLocation() {
      return {
        params: {},
        search: new URLSearchParams(),
        setSearch() {},
      };
    },
    useRequiredRouteStatus() {
      return {
        status: "idle",
        pending: false,
      };
    },
    useRequiredRouteData() {
      return {
        loaderResult: null,
        actionResult: null,
        data: null,
        view: null,
        error: null,
      };
    },
    useRequiredRouteActions() {
      return {
        reload() {},
        async submit() {},
      };
    },
    useRequiredResourceLocation() {
      return {
        params: {},
        search: new URLSearchParams(),
        setSearch() {},
      };
    },
    useRequiredResourceStatus() {
      return {
        status: "idle",
        pending: false,
      };
    },
    useRequiredResourceData() {
      return {
        loaderResult: null,
        actionResult: null,
        data: null,
        view: null,
        error: null,
      };
    },
    useRequiredResourceActions() {
      return {
        reload() {},
        async submit() {},
      };
    },
    useMatches() {
      return [];
    },
    createRouteFormComponent() {
      return () => null;
    },
    createResourceFormComponent() {
      return () => null;
    },
    createResourceComponent(_resourcePath, component) {
      return component;
    },
  };
}

describe("client binding singletons", () => {
  afterEach(() => {
    resetClientBindings();
  });

  test("stores installed client bindings in module-local runtime state", () => {
    const bindings = createBindings();

    installClientBindings(bindings);

    expect(getClientBindings()).toBe(bindings);
    expect("__litzjsClientBindings" in globalThis).toBe(false);
  });

  test("clears client bindings on reset without writing to globalThis", () => {
    installClientBindings(createBindings());

    resetClientBindings();

    expect(getClientBindings()).toBeNull();
    expect("__litzjsClientBindings" in globalThis).toBe(false);
  });
});
