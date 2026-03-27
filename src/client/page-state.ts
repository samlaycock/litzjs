import type { ActionHookResult, LoaderHookResult } from "../index";

type IdleResettableState = {
  readonly status: string;
  readonly pending: boolean;
  readonly errorInfo?: unknown;
  readonly errorTargetId?: string;
  readonly offlineStaleMatchIds?: ReadonlySet<string>;
};

type SettledResettableState = IdleResettableState &
  SettledStatusState & {
    readonly error: ActionHookResult | LoaderHookResult | null;
  };

type SettledStatusState = {
  readonly matchStates: Record<
    string,
    {
      readonly loaderResult: LoaderHookResult | null;
    }
  >;
  readonly actionResult: ActionHookResult | null;
  readonly offlineStaleMatchIds?: ReadonlySet<string>;
};

export function resolveSettledPageStatus(
  current: SettledStatusState,
  options: {
    includeActionResult?: boolean;
    ignoreLoaderMatchIds?: readonly string[];
  } = {},
): "idle" | "offline-stale" | "error" {
  if (current.offlineStaleMatchIds?.size) {
    return "offline-stale";
  }

  const ignoredMatchIds = new Set(options.ignoreLoaderMatchIds ?? []);

  for (const [matchId, matchState] of Object.entries(current.matchStates)) {
    if (ignoredMatchIds.has(matchId)) {
      continue;
    }

    if (matchState.loaderResult?.kind === "error") {
      return "error";
    }
  }

  if (
    options.includeActionResult !== false &&
    (current.actionResult?.kind === "error" || current.actionResult?.kind === "fault")
  ) {
    return "error";
  }

  return "idle";
}

export function withIdleState<TState extends IdleResettableState>(
  current: TState,
): Omit<TState, "status" | "pending" | "errorInfo" | "errorTargetId" | "offlineStaleMatchIds"> & {
  status: "idle";
  pending: false;
  errorInfo: undefined;
  errorTargetId: undefined;
  offlineStaleMatchIds: undefined;
} {
  return {
    ...current,
    status: "idle",
    pending: false,
    errorInfo: undefined,
    errorTargetId: undefined,
    offlineStaleMatchIds: undefined,
  };
}

export function withSettledPageState<TState extends SettledResettableState>(
  current: TState,
): Omit<TState, "status" | "pending" | "errorInfo" | "errorTargetId" | "error"> & {
  status: "idle" | "offline-stale" | "error";
  pending: false;
  error: null;
  errorInfo: undefined;
  errorTargetId: undefined;
} {
  return {
    ...current,
    status: resolveSettledPageStatus(current, {
      includeActionResult: false,
    }),
    pending: false,
    error: null,
    errorInfo: undefined,
    errorTargetId: undefined,
  };
}
