import type { ActionHookResult, LoaderHookResult } from "../index";

type IdleResettableState = {
  readonly status: string;
  readonly pending: boolean;
  readonly errorInfo?: unknown;
  readonly errorTargetId?: string;
  readonly offlineStaleMatchIds?: ReadonlySet<string>;
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
  } = {},
): "idle" | "offline-stale" | "error" {
  if (current.offlineStaleMatchIds?.size) {
    return "offline-stale";
  }

  for (const matchState of Object.values(current.matchStates)) {
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
