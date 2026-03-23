const PUBLIC_RESULT_HEADER_NAMES = new Set([
  "content-type",
  "x-litz-kind",
  "x-litz-revalidate",
  "x-litz-status",
  "x-litz-view-id",
]);

export function createPublicResultHeaders(headers: Headers): Headers {
  const publicHeaders = new Headers();

  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();

    if (
      PUBLIC_RESULT_HEADER_NAMES.has(normalizedKey) ||
      normalizedKey.startsWith("x-litz-public-")
    ) {
      publicHeaders.append(key, value);
    }
  });

  return publicHeaders;
}
