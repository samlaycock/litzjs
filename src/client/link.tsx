import * as React from "react";

import { resolveClientHref } from "./base-url";
import { shouldInterceptLinkNavigation, toNavigationHref } from "./navigation";

export type LinkPrefetchMode = "none" | "intent" | "render";

export interface LinkProps extends Omit<React.ComponentPropsWithoutRef<"a">, "href"> {
  readonly href: string;
  readonly replace?: boolean;
  readonly prefetch?: LinkPrefetchMode;
  readonly prefetchData?: boolean;
}

// The dependency bag is expected to be module-level or memoized by the caller.
export function createLinkComponent(dependencies: {
  useNavigate(): (href: string, options?: { replace?: boolean }) => void;
  prefetchRouteForHref(
    href: string,
    options?: {
      target?: string | null;
      download?: string | boolean | null;
      includeData?: boolean;
      signal?: AbortSignal;
    },
  ): void;
}): React.ComponentType<LinkProps> {
  return function LitzLink(props: LinkProps): React.ReactElement {
    const navigate = dependencies.useNavigate();
    const {
      href,
      replace = false,
      prefetch = "intent",
      prefetchData = false,
      onClick,
      onMouseEnter,
      onMouseLeave,
      onFocus,
      onBlur,
      onTouchStart,
      onTouchEnd,
      onTouchCancel,
      target,
      download,
      rel,
      ...rest
    } = props;
    const browserHref = resolveClientHref(href);
    const intentPrefetchKey = JSON.stringify([
      browserHref,
      target ?? null,
      download ?? null,
      prefetchData,
    ]);
    const intentPrefetchRef = React.useRef<{
      readonly key: string;
      readonly controller: AbortController;
    } | null>(null);
    const intentStateRef = React.useRef({
      hover: false,
      focus: false,
      touch: false,
    });

    React.useEffect(() => {
      if (prefetch !== "render") {
        return;
      }

      const controller = new AbortController();

      dependencies.prefetchRouteForHref(browserHref, {
        target,
        download,
        includeData: prefetchData,
        signal: controller.signal,
      });

      return () => {
        controller.abort();
      };
    }, [browserHref, dependencies, download, prefetch, prefetchData, target]);

    function abortIntentPrefetchIfIdle(): void {
      const intentState = intentStateRef.current;

      if (intentState.hover || intentState.focus || intentState.touch) {
        return;
      }

      intentPrefetchRef.current?.controller.abort();
      intentPrefetchRef.current = null;
    }

    function startIntentPrefetch(): void {
      if (prefetch !== "intent") {
        return;
      }

      const currentPrefetch = intentPrefetchRef.current;

      if (
        currentPrefetch?.key === intentPrefetchKey &&
        !currentPrefetch.controller.signal.aborted
      ) {
        return;
      }

      currentPrefetch?.controller.abort();

      const controller = new AbortController();
      intentPrefetchRef.current = {
        key: intentPrefetchKey,
        controller,
      };

      dependencies.prefetchRouteForHref(browserHref, {
        target,
        download,
        includeData: prefetchData,
        signal: controller.signal,
      });
    }

    React.useEffect(() => {
      const intentState = intentStateRef.current;

      if (intentState.hover || intentState.focus || intentState.touch) {
        startIntentPrefetch();
      }

      return () => {
        intentPrefetchRef.current?.controller.abort();
        intentPrefetchRef.current = null;
      };
    }, [intentPrefetchKey, prefetch]);

    return React.createElement("a", {
      ...rest,
      href: browserHref,
      target,
      download,
      rel,
      onMouseEnter(event: React.MouseEvent<HTMLAnchorElement>) {
        onMouseEnter?.(event);

        if (event.defaultPrevented) {
          return;
        }

        intentStateRef.current.hover = true;
        startIntentPrefetch();
      },
      onMouseLeave(event: React.MouseEvent<HTMLAnchorElement>) {
        onMouseLeave?.(event);
        intentStateRef.current.hover = false;
        abortIntentPrefetchIfIdle();
      },
      onFocus(event: React.FocusEvent<HTMLAnchorElement>) {
        onFocus?.(event);

        if (event.defaultPrevented) {
          return;
        }

        intentStateRef.current.focus = true;
        startIntentPrefetch();
      },
      onBlur(event: React.FocusEvent<HTMLAnchorElement>) {
        onBlur?.(event);
        intentStateRef.current.focus = false;
        abortIntentPrefetchIfIdle();
      },
      onTouchStart(event: React.TouchEvent<HTMLAnchorElement>) {
        onTouchStart?.(event);

        if (event.defaultPrevented) {
          return;
        }

        intentStateRef.current.touch = true;
        startIntentPrefetch();
      },
      onTouchEnd(event: React.TouchEvent<HTMLAnchorElement>) {
        onTouchEnd?.(event);
        intentStateRef.current.touch = false;
        abortIntentPrefetchIfIdle();
      },
      onTouchCancel(event: React.TouchEvent<HTMLAnchorElement>) {
        onTouchCancel?.(event);
        intentStateRef.current.touch = false;
        abortIntentPrefetchIfIdle();
      },
      onClick(event: React.MouseEvent<HTMLAnchorElement>) {
        onClick?.(event);

        if (event.defaultPrevented) {
          return;
        }

        const nextUrl = new URL(browserHref, window.location.href);
        const currentUrl = new URL(window.location.href);

        if (
          !shouldInterceptLinkNavigation({
            button: event.button,
            metaKey: event.metaKey,
            altKey: event.altKey,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            target,
            download,
            currentUrl,
            nextUrl,
          })
        ) {
          return;
        }

        event.preventDefault();
        navigate(toNavigationHref(nextUrl), { replace });
      },
    });
  };
}
