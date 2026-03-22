import { Window } from "happy-dom";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

type DomSnapshot = {
  [key: string]: unknown;
};

const DOM_GLOBAL_KEYS = [
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "SubmitEvent",
  "Node",
  "Text",
  "Element",
  "HTMLElement",
  "HTMLFormElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "FormData",
  "File",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "IS_REACT_ACT_ENVIRONMENT",
] as const;

export function installTestDom(url = "https://example.com/"): {
  window: Window;
  cleanup(): void;
} {
  const window = new Window({
    url,
  });
  const globalObject = globalThis as unknown as Record<string, unknown>;
  const windowObject = window as Window & Record<string, unknown>;
  const snapshot: DomSnapshot = {};

  windowObject.SyntaxError = SyntaxError;

  for (const key of DOM_GLOBAL_KEYS) {
    snapshot[key] = globalObject[key];

    if (key === "IS_REACT_ACT_ENVIRONMENT") {
      globalObject[key] = true;
      continue;
    }

    globalObject[key] = windowObject[key];
  }

  return {
    window,
    cleanup() {
      if (typeof window.happyDOM.abort === "function") {
        void window.happyDOM.abort();
      }

      for (const key of DOM_GLOBAL_KEYS) {
        const value = snapshot[key];

        if (value === undefined) {
          delete globalObject[key];
        } else {
          globalObject[key] = value;
        }
      }
    },
  };
}

export async function flushDom(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
