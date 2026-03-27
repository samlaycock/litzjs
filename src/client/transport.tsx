import type { ActionHookResult, LoaderHookResult } from "../index";

import { createPublicResultHeaders } from "./result-headers";

export type LitzJsonBody =
  | {
      kind: "data";
      data: unknown;
      revalidate?: string[];
    }
  | {
      kind: "invalid";
      fields?: Record<string, string>;
      formError?: string;
      data?: unknown;
    }
  | {
      kind: "redirect";
      location: string;
      replace?: boolean;
      revalidate?: string[];
    }
  | {
      kind: "error";
      message: string;
      code?: string;
      data?: unknown;
    }
  | {
      kind: "fault";
      message: string;
      digest?: string;
    };

type LitzJsonKind = LitzJsonBody["kind"];

export async function parseLoaderResponse(response: Response): Promise<LoaderHookResult> {
  const contentType = response.headers.get("content-type") ?? "";
  const publicHeaders = createPublicResultHeaders(response.headers);

  if (contentType.includes("text/x-component")) {
    return createViewResult(response, publicHeaders);
  }

  const body = await parseLitzJsonResponse(response, [
    "data",
    "error",
    "fault",
    "redirect",
  ] as const);

  if (body.kind === "fault") {
    throw createRouteLikeError(response.status, publicHeaders, body);
  }

  if (body.kind === "data") {
    return {
      kind: "data",
      status: response.status,
      headers: publicHeaders,
      stale: false,
      data: body.data,
      render() {
        return null;
      },
    };
  }

  if (body.kind === "error") {
    return {
      kind: "error",
      status: response.status,
      headers: publicHeaders,
      stale: false,
      message: body.message,
      code: body.code,
      data: body.data,
    };
  }

  if (body.kind === "redirect") {
    throw createRedirectSignal(response.status, publicHeaders, body);
  }

  throw createRouteLikeError(response.status, publicHeaders, body);
}

export async function parseActionResponse(response: Response): Promise<ActionHookResult> {
  const contentType = response.headers.get("content-type") ?? "";
  const publicHeaders = createPublicResultHeaders(response.headers);

  if (contentType.includes("text/x-component")) {
    return createViewResult(response, publicHeaders);
  }

  const body = await parseLitzJsonResponse(response, [
    "data",
    "invalid",
    "redirect",
    "error",
    "fault",
  ] as const);

  switch (body.kind) {
    case "data":
      return {
        kind: "data",
        status: response.status,
        headers: publicHeaders,
        data: body.data,
      };
    case "invalid":
      return {
        kind: "invalid",
        status: response.status,
        headers: publicHeaders,
        fields: body.fields,
        formError: body.formError,
        data: body.data,
      };
    case "redirect":
      return {
        kind: "redirect",
        status: response.status,
        headers: publicHeaders,
        location: body.location,
        replace: body.replace ?? false,
      };
    case "error":
      return {
        kind: "error",
        status: response.status,
        headers: publicHeaders,
        message: body.message,
        code: body.code,
        data: body.data,
      };
    case "fault":
      return {
        kind: "fault",
        status: response.status,
        headers: publicHeaders,
        message: body.message,
        digest: body.digest,
      };
  }
}

export async function createViewResult(
  response: Response,
  publicHeaders = createPublicResultHeaders(response.headers),
): Promise<
  Extract<LoaderHookResult, { kind: "view" }> & Extract<ActionHookResult, { kind: "view" }>
> {
  if (!response.body) {
    throw new Error("Flight response body is missing.");
  }

  const { createFromReadableStream } = await import("@vitejs/plugin-rsc/browser");
  const node = await createFromReadableStream(response.body);

  return {
    kind: "view",
    status: Number(response.headers.get("x-litzjs-status") ?? response.status),
    headers: publicHeaders,
    stale: false,
    node: node as import("react").ReactNode,
    render() {
      return node as import("react").ReactNode;
    },
  };
}

export function isRouteLikeError(value: unknown): value is {
  kind: "error" | "fault";
  status: number;
  headers: Headers;
  message: string;
  code?: string;
  digest?: string;
  data?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    ((value as { kind: string }).kind === "error" || (value as { kind: string }).kind === "fault")
  );
}

export function isRedirectSignal(value: unknown): value is {
  kind: "redirect";
  status: number;
  headers: Headers;
  location: string;
  replace: boolean;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind: string }).kind === "redirect"
  );
}

export function getRevalidateTargets(headers: Headers): string[] {
  const value = headers.get("x-litzjs-revalidate");

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function parseLitzJsonResponse<const TAllowedKinds extends readonly LitzJsonKind[]>(
  response: Response,
  allowedKinds: TAllowedKinds,
): Promise<Extract<LitzJsonBody, { kind: TAllowedKinds[number] | "fault" }>> {
  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text();

  if (!isJsonContentType(contentType)) {
    return createInvalidTransportFault(response.status, contentType, bodyText, "non-json");
  }

  try {
    const parsedBody = JSON.parse(bodyText) as unknown;

    if (isLitzJsonBody(parsedBody) && allowedKinds.includes(parsedBody.kind)) {
      return parsedBody as Extract<LitzJsonBody, { kind: TAllowedKinds[number] | "fault" }>;
    }

    return createInvalidTransportFault(response.status, contentType, bodyText, "unsupported-kind");
  } catch {
    return createInvalidTransportFault(response.status, contentType, bodyText, "malformed-json");
  }
}

function createRouteLikeError(
  status: number,
  headers: Headers,
  body: Extract<LitzJsonBody, { kind: "error" | "fault" }>,
) {
  return {
    kind: body.kind,
    status,
    headers,
    message: body.message,
    code: "code" in body ? body.code : undefined,
    digest: "digest" in body ? body.digest : undefined,
    data: "data" in body ? body.data : undefined,
  };
}

function createInvalidTransportFault(
  status: number,
  contentType: string,
  bodyText: string,
  reason: "malformed-json" | "non-json" | "unsupported-kind",
): Extract<LitzJsonBody, { kind: "fault" }> {
  const detail = describeInvalidTransportResponse(status, contentType, bodyText, reason);

  return {
    kind: "fault",
    message: detail,
  };
}

function describeInvalidTransportResponse(
  status: number,
  contentType: string,
  bodyText: string,
  reason: "malformed-json" | "non-json" | "unsupported-kind",
): string {
  if (!isDevelopmentEnvironment()) {
    return "[litzjs] The server returned an invalid response.";
  }

  const responseType =
    reason === "malformed-json"
      ? "malformed JSON"
      : reason === "unsupported-kind"
        ? "an unsupported result payload"
        : "a non-JSON payload";
  const normalizedContentType = contentType || "unknown content-type";
  const preview = createResponsePreview(bodyText);

  return `[litzjs] The server returned ${responseType} with status ${status} and content-type "${normalizedContentType}". Preview: ${preview}`;
}

function isJsonContentType(contentType: string): boolean {
  const mimeType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";

  return mimeType === "application/json" || mimeType.endsWith("+json");
}

function isLitzJsonBody(value: unknown): value is LitzJsonBody {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }

  const kind = (value as { kind?: unknown }).kind;

  if (kind === "data" || kind === "invalid") {
    return true;
  }

  if (kind === "redirect") {
    return typeof (value as { location?: unknown }).location === "string";
  }

  if (kind === "error" || kind === "fault") {
    return typeof (value as { message?: unknown }).message === "string";
  }

  return false;
}

function createResponsePreview(bodyText: string): string {
  const normalized = bodyText.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "<empty>";
  }

  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}

function createRedirectSignal(
  status: number,
  headers: Headers,
  body: Extract<LitzJsonBody, { kind: "redirect" }>,
) {
  return {
    kind: "redirect" as const,
    status,
    headers,
    location: body.location,
    replace: body.replace ?? false,
  };
}
