import { getApiBaseUrl } from "../config";
import { ApiError, type ApiEnvelope, type ApiErrorDetail } from "./api-error";

export async function unwrapResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const payload = await readJson(response);
  if (!isApiEnvelope(payload)) {
    throw new ApiError(
      response.ok
        ? "Invalid API response"
        : `Request failed with status ${response.status}`,
      {
        status: response.status,
        code: null,
        traceId: response.headers.get("x-trace-id"),
      },
    );
  }

  const traceId = payload.traceId || response.headers.get("x-trace-id");
  if (!response.ok || payload.code !== response.status) {
    throw new ApiError(payload.msg, {
      status: response.status,
      code: payload.code,
      traceId,
      details: getErrorDetails(payload),
    });
  }

  return payload.data as T;
}

export function resolveApiUrl(path: string): URL {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) {
    throw new TypeError("API path must be relative to the configured base URL");
  }
  const baseUrl = new URL(`${getApiBaseUrl().replace(/\/+$/, "")}/`);
  const url = new URL(path.replace(/^\/+/, ""), baseUrl);
  if (
    url.origin !== baseUrl.origin ||
    !url.pathname.startsWith(baseUrl.pathname)
  ) {
    throw new TypeError(
      "API path must stay within the configured API base URL",
    );
  }
  return url;
}

export function serializeBody(
  body: unknown,
  headers: Headers,
): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string" || isPlatformBody(body)) return body;

  headers.set("Content-Type", "application/json");
  return JSON.stringify(body);
}

function isPlatformBody(value: unknown): value is BodyInit {
  if (typeof value !== "object" || value === null) return false;
  return (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof Blob !== "undefined" && value instanceof Blob) ||
    (typeof FormData !== "undefined" && value instanceof FormData) ||
    (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams)
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<ApiEnvelope<unknown>>;
  return (
    Number.isInteger(envelope.code) &&
    typeof envelope.msg === "string" &&
    "data" in envelope &&
    typeof envelope.traceId === "string"
  );
}

function getErrorDetails(value: ApiEnvelope<unknown>): ApiErrorDetail[] {
  if (!("details" in value) || !Array.isArray(value.details)) return [];
  return value.details.filter(isApiErrorDetail);
}

function isApiErrorDetail(value: unknown): value is ApiErrorDetail {
  if (!value || typeof value !== "object") return false;
  const detail = value as Partial<ApiErrorDetail>;
  return (
    typeof detail.code === "string" &&
    typeof detail.message === "string" &&
    (detail.field === undefined || typeof detail.field === "string")
  );
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
