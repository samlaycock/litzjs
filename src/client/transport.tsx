import { createFromReadableStream } from "@vitejs/plugin-rsc/browser";

import type { ActionHookResult, LoaderHookResult } from "../index";

import { createPublicResultHeaders } from "./result-headers";

export type VoltJsonBody =
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

export async function parseLoaderResponse(response: Response): Promise<LoaderHookResult> {
  const contentType = response.headers.get("content-type") ?? "";
  const publicHeaders = createPublicResultHeaders(response.headers);

  if (contentType.includes("text/x-component")) {
    return createViewResult(response, publicHeaders);
  }

  const body = (await response.json()) as VoltJsonBody;

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
    throw createRouteLikeError(response.status, publicHeaders, body);
  }

  if (body.kind === "fault") {
    throw createRouteLikeError(response.status, publicHeaders, body);
  }

  if (body.kind === "redirect") {
    throw createRedirectSignal(response.status, publicHeaders, body);
  }

  throw new Error(`Unsupported loader response kind "${body.kind}".`);
}

export async function parseActionResponse(response: Response): Promise<ActionHookResult> {
  const contentType = response.headers.get("content-type") ?? "";
  const publicHeaders = createPublicResultHeaders(response.headers);

  if (contentType.includes("text/x-component")) {
    return createViewResult(response, publicHeaders);
  }

  const body = (await response.json()) as VoltJsonBody;

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
    default:
      throw new Error(
        `Unsupported action response kind "${String((body as { kind?: unknown }).kind)}".`,
      );
  }
}

export function serializePayload(
  payload?: FormData | Record<string, unknown>,
): { type: "form-data" | "object"; entries: Array<[string, string]> } | null {
  if (!payload) {
    return null;
  }

  if (payload instanceof FormData) {
    return {
      type: "form-data",
      entries: Array.from(payload.entries()).map(([key, value]) => [
        key,
        serializePayloadValue(value),
      ]),
    };
  }

  const entries: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        entries.push([key, serializePayloadValue(item)]);
      }
      continue;
    }

    entries.push([key, serializePayloadValue(value)]);
  }

  return {
    type: "object",
    entries,
  };
}

function serializePayloadValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (value == null) {
    return "";
  }

  if (value instanceof File) {
    return value.name;
  }

  return JSON.stringify(value);
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

  const node = await createFromReadableStream(response.body);

  return {
    kind: "view",
    status: Number(response.headers.get("x-volt-status") ?? response.status),
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
  const value = headers.get("x-volt-revalidate");

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createRouteLikeError(
  status: number,
  headers: Headers,
  body: Extract<VoltJsonBody, { kind: "error" | "fault" }>,
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

function createRedirectSignal(
  status: number,
  headers: Headers,
  body: Extract<VoltJsonBody, { kind: "redirect" }>,
) {
  return {
    kind: "redirect" as const,
    status,
    headers,
    location: body.location,
    replace: body.replace ?? false,
  };
}
