import { ApiError } from "./api-error";
import type { ApiRequestOptions } from "./api-client";
import type { components } from "./openapi";
import {
  resolveApiUrl,
  serializeBody,
  unwrapResponse,
  isAbortError,
} from "./api-protocol";
import {
  assertSessionEpoch,
  sessionEpoch,
  browserSessionBlocked,
  confirmBrowserSession,
  confirmBrowserLogout,
  clearSessionTokens,
  beginSessionChange,
  sessionBoundaryMessage,
  withBrowserSessionLock,
} from "../auth/browser-session";
export type { ApiRequestOptions } from "./api-client";
type AuthSession = components["schemas"]["AuthSessionDataVO"];
type User = components["schemas"]["CurrentUserVO"];
function check(expected: number, signal?: AbortSignal | null) {
  assertSessionEpoch(expected);
  signal?.throwIfAborted();
}
function publicRead(path: string, method: string) {
  return (
    ["GET", "HEAD"].includes(method) &&
    /^\/(?:health|public\/config|catalog\/(?:ski_resort|article|dynamic)\/fields(?:\?|$)|resorts(?:\/|\?|$)|articles(?:\/|\?|$)|knowledge\/categories(?:\?|$)|dynamics(?:\/|\?|$))/.test(
      path,
    )
  );
}
// These commands query only the public projection; cookie transport is still
// required for the server's Origin/CSRF validation on POST.
function publicCatalogQuery(path: string, method: string) {
  return (
    method === "POST" &&
    /^\/catalog\/(?:ski_resort|article|dynamic)\/query(?:\?|$)/.test(path)
  );
}
const authPath = (path: string) =>
  /^\/auth\/(?:login|register|refresh|logout|csrf)(?:\?|$)/.test(path);
const csrfFailure = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 403 &&
  error.message === "CSRF validation failed";
function rejected(status: number, message: string) {
  return new ApiError(message, { status, code: null, traceId: null });
}
export function validateBrowserSession(
  value: unknown,
): asserts value is AuthSession {
  const session = value as Partial<AuthSession> | null;
  const user = session?.currentUser;
  if (
    !session ||
    session.accessToken !== undefined ||
    session.refreshToken !== undefined ||
    !user ||
    !Number.isInteger(user.userId) ||
    user.userId < 1 ||
    typeof user.account !== "string" ||
    typeof user.nickname !== "string" ||
    !Array.isArray(user.permissionKeys) ||
    !user.permissionKeys.every((key) => typeof key === "string") ||
    !Array.isArray(user.roles) ||
    !Array.isArray(user.menuTree) ||
    typeof session.accessTokenExpiresAt !== "string" ||
    !Number.isFinite(Date.parse(session.accessTokenExpiresAt)) ||
    typeof session.sessionExpiresAt !== "string" ||
    !Number.isFinite(Date.parse(session.sessionExpiresAt))
  )
    throw new TypeError("浏览器会话响应无效");
}
async function fetchRaw(
  path: string,
  options: ApiRequestOptions,
  expected: number,
  accept: string,
  credentials: RequestCredentials,
  csrf?: string,
): Promise<Response> {
  check(expected, options.signal);
  const url = resolveApiUrl(path),
    headers = new Headers(options.headers);
  // Cookies are the sole browser authentication channel.
  headers.delete("Authorization");
  headers.delete("X-CSRF-Token");
  headers.set("Accept", accept);
  if (csrf) headers.set("X-CSRF-Token", csrf);
  const body = serializeBody(options.body, headers);
  const {
    body: _body,
    expectedSessionEpoch: _epoch,
    skipAuthRefresh: _refresh,
    ...rest
  } = options;
  try {
    const response = await fetch(url, {
      ...rest,
      credentials,
      mode: "cors",
      cache: "no-store",
      headers,
      body,
    });
    try {
      check(expected, options.signal);
    } catch (error) {
      void response.body?.cancel().catch(() => undefined);
      throw error;
    }
    return response;
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw rejected(0, "Network request failed");
  }
}
async function send(
  path: string,
  options: ApiRequestOptions,
  expected: number,
  accept = "application/json",
): Promise<Response> {
  check(expected, options.signal);
  const method = (options.method ?? "GET").toUpperCase(),
    auth = authPath(path);
  const blocked = browserSessionBlocked();
  const catalogQuery = publicCatalogQuery(path, method);
  if (blocked && !auth && !publicRead(path, method) && !catalogQuery)
    throw rejected(401, "当前会话已停用，请重新登录");
  const credentials = blocked && !auth && !catalogQuery ? "omit" : "include";
  if (["GET", "HEAD", "OPTIONS"].includes(method))
    return fetchRaw(path, options, expected, accept, credentials);
  const csrf = async () => {
    const result = await unwrapResponse<{ csrfToken: string | null }>(
      await fetchRaw(
        "/auth/csrf",
        { method: "GET", signal: options.signal },
        expected,
        "application/json",
        "include",
      ),
    );
    check(expected, options.signal);
    if (typeof result?.csrfToken !== "string" || !result.csrfToken)
      throw new TypeError("服务未签发浏览器 CSRF 令牌，请核对 Origin 配置");
    return result.csrfToken;
  };
  // Request a fresh CSRF token inside the same cross-tab lock as every write.
  let response = await fetchRaw(
    path,
    { ...options, method },
    expected,
    accept,
    credentials,
    await csrf(),
  );
  if (response.status === 403) {
    try {
      await unwrapResponse(response.clone());
    } catch (error) {
      if (csrfFailure(error)) {
        void response.body?.cancel().catch(() => undefined);
        response = await fetchRaw(
          path,
          { ...options, method },
          expected,
          accept,
          credentials,
          await csrf(),
        );
      }
    }
  }
  return response;
}
async function rotate(expected: number): Promise<AuthSession | null> {
  check(expected);
  if (browserSessionBlocked()) return null;
  try {
    const session = await unwrapResponse<unknown>(
      await send("/auth/refresh", { method: "POST", body: {} }, expected),
    );
    check(expected);
    validateBrowserSession(session);
    confirmBrowserSession(expected);
    return session;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearSessionTokens(expected);
      return null;
    }
    // A failed rotation may already have committed; never replay it automatically.
    if (
      !(error instanceof ApiError) ||
      error.status === 0 ||
      error.status === 408 ||
      error.status >= 500
    ) {
      assertSessionEpoch(expected);
      await beginSessionChange(true).ready;
    }
    throw error;
  }
}
async function run<T>(
  path: string,
  options: ApiRequestOptions,
  stream: boolean,
): Promise<T> {
  const expected = options.expectedSessionEpoch ?? sessionEpoch();
  resolveApiUrl(path);
  check(expected, options.signal);
  return withBrowserSessionLock(async () => {
    check(expected, options.signal);
    let response = await send(
      path,
      options,
      expected,
      stream ? "text/event-stream" : "application/json",
    );
    if (
      response.status === 401 &&
      !authPath(path) &&
      !options.skipAuthRefresh &&
      !browserSessionBlocked()
    ) {
      void response.body?.cancel().catch(() => undefined);
      if (await rotate(expected)) {
        check(expected, options.signal);
        response = await send(
          path,
          options,
          expected,
          stream ? "text/event-stream" : "application/json",
        );
      } else throw rejected(401, "登录会话已失效");
    }
    if (stream) {
      if (!response.ok) await unwrapResponse(response);
      if (
        !response.headers
          .get("content-type")
          ?.startsWith("text/event-stream") ||
        !response.body
      ) {
        void response.body?.cancel().catch(() => undefined);
        throw new TypeError("Invalid AI stream response");
      }
      check(expected, options.signal);
      return response as T;
    }
    const result = await unwrapResponse<T>(response);
    check(expected, options.signal);
    if (path === "/auth/login") {
      validateBrowserSession(result);
      confirmBrowserSession(expected);
    }
    if (path === "/auth/logout") {
      if ((result as { loggedOut?: unknown } | null)?.loggedOut !== true)
        throw new TypeError("退出结果尚未确认");
      confirmBrowserLogout(expected);
    }
    return result;
  }, options.signal);
}
export function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return run(path, options, false);
}
export function apiStreamRequest(
  path: string,
  options: ApiRequestOptions,
): Promise<Response> {
  return run(path, options, true);
}
let restoreFlight: { epoch: number; promise: Promise<User | null> } | null =
  null;
export function restoreBrowserSession(
  expected = sessionEpoch(),
): Promise<User | null> {
  assertSessionEpoch(expected);
  if (restoreFlight?.epoch === expected) return restoreFlight.promise;
  const flight = {
    epoch: expected,
    promise: Promise.resolve<User | null>(null),
  };
  flight.promise = withBrowserSessionLock(async () => {
    check(expected);
    if (browserSessionBlocked()) {
      const notice = sessionBoundaryMessage();
      if (notice) throw new Error(notice);
      return null;
    }
    // A fresh access cookie avoids needless cross-tab refresh rotations.
    const response = await send("/auth/me", { method: "GET" }, expected);
    if (response.status === 401) {
      void response.body?.cancel().catch(() => undefined);
      return (await rotate(expected))?.currentUser ?? null;
    }
    const user = await unwrapResponse<User>(response);
    check(expected);
    if (
      !user ||
      !Number.isInteger(user.userId) ||
      !Array.isArray(user.permissionKeys)
    )
      throw new TypeError("当前用户响应无效");
    return user;
  }).finally(() => {
    if (restoreFlight === flight) restoreFlight = null;
  });
  restoreFlight = flight;
  return flight.promise;
}
