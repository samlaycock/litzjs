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
    delete globalThis.__litzjsClientBindings;
    resetClientBindings();
  });

  test("stores installed client bindings on globalThis", () => {
    const bindings = createBindings();

    installClientBindings(bindings);

    expect(getClientBindings()).toBe(bindings);
    expect(globalThis.__litzjsClientBindings).toBe(bindings);
  });

  test("clears global client bindings on reset", () => {
    installClientBindings(createBindings());

    resetClientBindings();

    expect(getClientBindings()).toBeNull();
    expect(globalThis.__litzjsClientBindings).toBeNull();
  });
});
