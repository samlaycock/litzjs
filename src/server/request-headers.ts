const INTERNAL_REQUEST_HEADER_NAMES = new Set([
  "content-length",
  "content-type",
  "host",
  "transfer-encoding",
  "x-volt-request",
]);

export function createInternalHandlerHeaders(headers: Headers): Headers {
  const forwarded = new Headers();

  headers.forEach((value, key) => {
    if (INTERNAL_REQUEST_HEADER_NAMES.has(key.toLowerCase())) {
      return;
    }

    forwarded.append(key, value);
  });

  return forwarded;
}
