export type RuntimeInputValidationContext<TContext = unknown> = {
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext | undefined;
};

export type RuntimeInputValidation = {
  params?: (params: any, context: any) => any;
  search?: (search: any, context: any) => any;
  headers?: (headers: any, context: any) => any;
  body?: (request: any, context: any) => any;
};

type RuntimeServerResult =
  | {
      kind: "data";
      status?: number;
      headers?: HeadersInit;
      data: unknown;
    }
  | {
      kind: "invalid";
      status?: number;
      headers?: HeadersInit;
      fields?: Record<string, string>;
      formError?: string;
      data?: unknown;
    }
  | {
      kind: "redirect";
      status?: number;
      headers?: HeadersInit;
      location: string;
      replace?: boolean;
      revalidate?: string[];
    }
  | {
      kind: "error";
      status?: number;
      headers?: HeadersInit;
      message: string;
      code?: string;
      data?: unknown;
    }
  | {
      kind: "fault";
      status?: number;
      headers?: HeadersInit;
      message: string;
      digest?: string;
    }
  | {
      kind: "view";
      status?: number;
      headers?: HeadersInit;
      node: unknown;
      revalidate?: string[];
    };

export async function resolveValidatedInput<TContext>(options: {
  validation?: RuntimeInputValidation;
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext | undefined;
}): Promise<{
  params: unknown;
  search: unknown;
  headers: unknown;
  body: unknown;
}> {
  const validationContext: RuntimeInputValidationContext<TContext> = {
    request: options.request,
    params: options.params,
    signal: options.signal,
    context: options.context,
  };
  const search = new URL(options.request.url).searchParams;

  return {
    params: options.validation?.params
      ? await options.validation.params(options.params, validationContext)
      : options.params,
    search: options.validation?.search
      ? await options.validation.search(search, validationContext)
      : search,
    headers: options.validation?.headers
      ? await options.validation.headers(options.request.headers, validationContext)
      : options.request.headers,
    body:
      !options.validation?.body ||
      options.request.method === "GET" ||
      options.request.method === "HEAD"
        ? undefined
        : await options.validation.body(options.request.clone(), validationContext),
  };
}

export function isServerResultLike(value: unknown): value is RuntimeServerResult {
  if (!value || typeof value !== "object" || !("kind" in value)) {
    return false;
  }

  switch ((value as { kind: string }).kind) {
    case "data":
    case "invalid":
    case "redirect":
    case "error":
    case "fault":
    case "view":
      return true;
    default:
      return false;
  }
}

export function createApiResponseFromResult(result: RuntimeServerResult): Response {
  const headers = new Headers(result.headers);

  switch (result.kind) {
    case "data":
      return createJsonResponse(result.status ?? 200, { data: result.data }, headers);
    case "invalid":
      return createJsonResponse(
        result.status ?? 422,
        {
          fields: result.fields,
          formError: result.formError,
          data: result.data,
        },
        headers,
      );
    case "redirect":
      headers.set("location", result.location);
      return new Response(null, {
        status: result.status ?? 303,
        headers,
      });
    case "error":
      return createJsonResponse(
        result.status ?? 500,
        {
          message: result.message,
          code: result.code,
          data: result.data,
        },
        headers,
      );
    case "fault":
      return createJsonResponse(
        result.status ?? 500,
        {
          message: result.message,
          digest: result.digest,
        },
        headers,
      );
    case "view":
      return createJsonResponse(
        500,
        {
          message: "View responses are not supported for API validation.",
        },
        headers,
      );
  }
}

function createJsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers: Headers,
): Response {
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}
