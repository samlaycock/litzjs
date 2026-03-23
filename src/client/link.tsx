import * as React from "react";

import { shouldInterceptLinkNavigation, toNavigationHref } from "./navigation";

export type LinkProps = Omit<React.ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
  replace?: boolean;
};

export function createLinkComponent(dependencies: {
  useNavigate(): (href: string, options?: { replace?: boolean }) => void;
  prefetchRouteModuleForHref(href: string, target?: string, download?: string | boolean): void;
}): React.ComponentType<LinkProps> {
  return function LitzLink(props: LinkProps): React.ReactElement {
    const navigate = dependencies.useNavigate();
    const {
      href,
      replace = false,
      onClick,
      onMouseEnter,
      onFocus,
      onTouchStart,
      target,
      download,
      rel,
      ...rest
    } = props;

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

        dependencies.prefetchRouteModuleForHref(href, target, download);
      },
      onFocus(event: React.FocusEvent<HTMLAnchorElement>) {
        onFocus?.(event);

        if (event.defaultPrevented) {
          return;
        }

        dependencies.prefetchRouteModuleForHref(href, target, download);
      },
      onTouchStart(event: React.TouchEvent<HTMLAnchorElement>) {
        onTouchStart?.(event);

        if (event.defaultPrevented) {
          return;
        }

        dependencies.prefetchRouteModuleForHref(href, target, download);
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
