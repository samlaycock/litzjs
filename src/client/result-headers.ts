const PUBLIC_RESULT_HEADER_NAMES = new Set([
  "content-type",
  "x-litzjs-kind",
  "x-litzjs-revalidate",
  "x-litzjs-status",
  "x-litzjs-view-id",
]);

export function createPublicResultHeaders(headers: Headers): Headers {
  const publicHeaders = new Headers();

  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();

    if (
      PUBLIC_RESULT_HEADER_NAMES.has(normalizedKey) ||
      normalizedKey.startsWith("x-litzjs-public-")
    ) {
      publicHeaders.append(key, value);
    }
  });

  return publicHeaders;
}
