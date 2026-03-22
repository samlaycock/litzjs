const PUBLIC_RESULT_HEADER_NAMES = new Set([
  "content-type",
  "x-volt-kind",
  "x-volt-revalidate",
  "x-volt-status",
  "x-volt-view-id",
]);

export function createPublicResultHeaders(headers: Headers): Headers {
  const publicHeaders = new Headers();

  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();

    if (
      PUBLIC_RESULT_HEADER_NAMES.has(normalizedKey) ||
      normalizedKey.startsWith("x-volt-public-")
    ) {
      publicHeaders.append(key, value);
    }
  });

  return publicHeaders;
}
