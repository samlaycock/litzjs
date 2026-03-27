type IdleResettableState = {
  readonly status: string;
  readonly pending: boolean;
  readonly errorInfo?: unknown;
  readonly errorTargetId?: string;
  readonly offlineStaleMatchIds?: ReadonlySet<string>;
};

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
