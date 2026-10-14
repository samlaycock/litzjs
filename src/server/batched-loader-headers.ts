import { isServerResultLike } from "../input-validation";
import { createPublicResultHeaders } from "../result-headers";

export function createBatchedResultEntryHeaders(
  headers: Headers,
): Array<[string, string]> | undefined {
  const entries = Array.from(createPublicResultHeaders(headers).entries());

  return entries.length > 0 ? entries : undefined;
}

export function createBatchedResponseHeaders(entryHeaders: Headers[]): Headers {
  const headers = new Headers();
  let noStore = false;
  let isPrivate = false;

  for (const entry of entryHeaders) {
    for (const cookie of entry.getSetCookie()) {
      headers.append("set-cookie", cookie);
    }

    const directives = (entry.get("cache-control") ?? "")
      .split(",")
      .map((directive) => directive.trim().toLowerCase());

    noStore ||= directives.includes("no-store");
    isPrivate ||= directives.some((directive) => directive.split("=", 1)[0] === "private");
  }

  if (noStore) {
    headers.set("cache-control", "no-store");
  } else if (isPrivate) {
    headers.set("cache-control", "private, no-cache");
  }

  return headers;
}

export function getSettledResultHeaders(result: PromiseSettledResult<unknown>): Headers {
  const value = result.status === "fulfilled" ? result.value : result.reason;

  if (!isServerResultLike(value) || value.kind === "view") {
    return new Headers();
  }

  return new Headers(value.headers);
}
