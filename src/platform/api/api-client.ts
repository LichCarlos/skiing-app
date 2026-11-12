import { ApiError } from "./api-error";
import {
  unwrapResponse,
  resolveApiUrl,
  serializeBody,
  isAbortError,
} from "./api-protocol";
import type { components } from "./openapi";
import {
  clearSessionTokens,
  readAccessToken,
  readRefreshToken,
  writeSessionTokens,
  assertSessionEpoch,
  sessionEpoch,
  SessionChangedError,
} from "../auth/secure-session";

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuthRefresh?: boolean;
  /** Internal auth operation boundary; never forwarded to fetch. */
  expectedSessionEpoch?: number;
}

type AuthSession = components["schemas"]["AuthSessionDataVO"];
let refreshFlight: {
  epoch: number;
  promise: Promise<AuthSession | null>;
} | null = null;

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return withAuthRefresh(path, options, () => requestApi<T>(path, options));
}

// The SSE body is consumed once; only a pre-stream 401 may be retried.
export async function apiStreamRequest(
  path: string,
  options: ApiRequestOptions,
): Promise<Response> {
  return withAuthRefresh(path, options, async () => {
    const response = await fetchApiResponse(path, options, "text/event-stream");
    if (!response.ok) await unwrapResponse(response);
    if (
      !response.headers.get("content-type")?.startsWith("text/event-stream") ||
      !response.body
    ) {
      await response.body?.cancel();
      throw new ApiError("Invalid AI stream response", {
        status: response.status,
        code: null,
        traceId: response.headers.get("x-trace-id"),
      });
    }
    return response;
  });
}

async function withAuthRefresh<T>(
  path: string,
  options: ApiRequestOptions,
  request: () => Promise<T>,
): Promise<T> {
  const expected = options.expectedSessionEpoch ?? sessionEpoch();
  const initialAccess = readAccessToken();
  async function attempt() {
    assertSessionEpoch(expected);
    options.signal?.throwIfAborted();
    const result = await request();
    try {
      assertSessionEpoch(expected);
      options.signal?.throwIfAborted();
    } catch (error) {
      if (result instanceof Response)
        void result.body?.cancel().catch(() => undefined);
      throw error;
    }
    return result;
  }
  try {
    return await attempt();
  } catch (error) {
    assertSessionEpoch(expected);
    options.signal?.throwIfAborted();
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      options.skipAuthRefresh === true ||
      isAuthenticationRoute(path)
    ) {
      throw error;
    }

    // A delayed 401 for an older access token must not rotate refresh again.
    if (initialAccess === readAccessToken()) {
      const refreshed = await waitForCaller(
        refreshMobileSession(expected),
        options.signal,
      );
      assertSessionEpoch(expected);
      if (!refreshed) throw error;
    }
    return attempt();
  }
}

async function requestApi<T>(
  path: string,
  options: ApiRequestOptions,
): Promise<T> {
  return unwrapResponse<T>(
    await fetchApiResponse(path, options, "application/json"),
  );
}

async function fetchApiResponse(
  path: string,
  options: ApiRequestOptions,
  accept: string,
): Promise<Response> {
  const url = resolveApiUrl(path);
  const headers = new Headers(options.headers);
  headers.set("Accept", accept);
  const accessToken = readAccessToken();
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const body = serializeBody(options.body, headers);
  const {
    body: _body,
    skipAuthRefresh: _skipAuthRefresh,
    expectedSessionEpoch: _expectedSessionEpoch,
    ...requestOptions
  } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      ...requestOptions,
      credentials: "omit",
      headers,
      body,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError("Network request failed", {
      status: 0,
      code: null,
      traceId: null,
      cause: error,
    });
  }

  return response;
}

// Restore and 401 recovery share exactly one rotation per session lifetime.
export function refreshMobileSession(
  expected = sessionEpoch(),
): Promise<AuthSession | null> {
  assertSessionEpoch(expected);
  if (refreshFlight?.epoch === expected) return refreshFlight.promise;
  const flight = {
    epoch: expected,
    promise: Promise.resolve<AuthSession | null>(null),
  };
  flight.promise = (async () => {
    const refreshToken = await readRefreshToken(expected);
    assertSessionEpoch(expected);
    if (!refreshToken) return null;
    try {
      const session = await requestApi<AuthSession>("/auth/refresh", {
        method: "POST",
        body: { refreshToken },
        expectedSessionEpoch: expected,
      });
      assertSessionEpoch(expected);
      if (!session.accessToken || !session.refreshToken)
        throw new TypeError("The API did not return mobile session tokens");
      await writeSessionTokens(
        session.accessToken,
        session.refreshToken,
        expected,
      );
      assertSessionEpoch(expected);
      return session;
    } catch (error) {
      assertSessionEpoch(expected);
      if (error instanceof ApiError && error.status === 401)
        await clearSessionTokens(expected);
      throw error;
    }
  })().finally(() => {
    if (refreshFlight === flight) refreshFlight = null;
  });
  refreshFlight = flight;
  return flight.promise;
}

function waitForCaller<T>(
  promise: Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new SessionChangedError());
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

function isAuthenticationRoute(path: string): boolean {
  return /(?:^|\/)auth\/(?:csrf|login|register|refresh|logout)(?:\?|$)/.test(
    path,
  );
}
