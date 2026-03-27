import * as React from "react";

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
      onFocus,
      onTouchStart,
      target,
      download,
      rel,
      ...rest
    } = props;

    React.useEffect(() => {
      if (prefetch !== "render") {
        return;
      }

      const controller = new AbortController();

      dependencies.prefetchRouteForHref(href, {
        target,
        download,
        includeData: prefetchData,
        signal: controller.signal,
      });

      return () => {
        controller.abort();
      };
    }, [dependencies, download, href, prefetch, prefetchData, target]);

    return React.createElement("a", {
      ...rest,
      href,
      target,
      download,
      rel,
      onMouseEnter(event: React.MouseEvent<HTMLAnchorElement>) {
        onMouseEnter?.(event);

        if (event.defaultPrevented) {
          return;
        }

        if (prefetch !== "intent") {
          return;
        }

        dependencies.prefetchRouteForHref(href, {
          target,
          download,
          includeData: prefetchData,
        });
      },
      onFocus(event: React.FocusEvent<HTMLAnchorElement>) {
        onFocus?.(event);

        if (event.defaultPrevented) {
          return;
        }

        if (prefetch !== "intent") {
          return;
        }

        dependencies.prefetchRouteForHref(href, {
          target,
          download,
          includeData: prefetchData,
        });
      },
      onTouchStart(event: React.TouchEvent<HTMLAnchorElement>) {
        onTouchStart?.(event);

        if (event.defaultPrevented) {
          return;
        }

        if (prefetch !== "intent") {
          return;
        }

        dependencies.prefetchRouteForHref(href, {
          target,
          download,
          includeData: prefetchData,
        });
      },
      onClick(event: React.MouseEvent<HTMLAnchorElement>) {
        onClick?.(event);

        if (event.defaultPrevented) {
          return;
        }

        const nextUrl = new URL(href, window.location.href);
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
