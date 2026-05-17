export function createAllowedMethodsHeader(
  methods: Partial<Record<string, unknown>> | undefined,
): string | undefined {
  if (!methods) {
    return undefined;
  }

  const allowed = Object.keys(methods)
    .filter((method) => method !== "ALL")
    .sort();

  if (methods.GET && !methods.HEAD) {
    allowed.push("HEAD");
    allowed.sort();
  }

  return allowed.length > 0 ? allowed.join(", ") : undefined;
}
