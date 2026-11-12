import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../src/platform/api/api-client.web";
import {
  login,
  logout,
  registerAccount,
  restoreSession,
} from "../src/platform/auth/auth-session.web";
import {
  browserSessionBlocked,
  clearSessionTokens,
  sessionBoundaryMessage,
} from "../src/platform/auth/browser-session";

// This is real HTTP with a test Cookie jar and browser API replacements, not a
// browser/CORS/SameSite/Expo UI acceptance test. No API success is synthesized.
vi.mock("expo-secure-store", () => {
  throw new Error("Web imported SecureStore");
});
const api = new URL(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
const fixture = JSON.parse(process.env.EXPO_WEB_FIXTURE_JSON ?? "null") as {
  databaseName: string;
  account: string;
};
const password = process.env.EXPO_WEB_FIXTURE_PASSWORD;
const replacement = process.env.EXPO_WEB_FIXTURE_REPLACEMENT;
if (
  !["localhost", "127.0.0.1"].includes(api.hostname) ||
  api.port !== "62950" ||
  fixture?.databaseName !== "linji_expo_web_validation" ||
  !password ||
  !replacement
)
  throw new Error(
    "Disposable Expo Web fixture and loopback API:62950 required",
  );
const origin = "http://localhost:62952";
const realFetch = globalThis.fetch;
const cookies = new Map<string, { value: string; path: string }>();
const metadata = new Map<string, string>();
const observed: Array<{
  path: string;
  status: number;
  setCookies: string[];
  data?: Record<string, unknown>;
}> = [];
let losePath: string | null = null;
let rejectCsrfOnce = false;
let userId = 0;
beforeAll(() => {
  let queue: Promise<unknown> = Promise.resolve();
  vi.stubGlobal("window", {
    crypto,
    navigator: {
      locks: {
        request: (
          _name: string,
          _options: unknown,
          work: () => Promise<unknown>,
        ) => {
          const result = queue.then(work);
          queue = result.catch(() => undefined);
          return result;
        },
      },
    },
    localStorage: {
      getItem: (key: string) => metadata.get(key) ?? null,
      setItem: (key: string, value: string) => {
        metadata.set(key, value);
      },
    },
    addEventListener: () => {},
  });
  vi.stubGlobal("fetch", async (input: URL, init: RequestInit) => {
    const url = new URL(input),
      path = url.pathname.replace("/api/v1", "");
    expect(url.origin).toBe(api.origin);
    expect(init.credentials).toMatch(/^(include|omit)$/);
    const headers = new Headers(init.headers);
    expect(headers.has("Authorization")).toBe(false);
    headers.set("Origin", origin);
    if (init.credentials === "include") {
      headers.set(
        "Cookie",
        [...cookies]
          .filter(
            ([, cookie]) =>
              url.pathname === cookie.path ||
              url.pathname.startsWith(cookie.path + "/"),
          )
          .map(([key, cookie]) => `${key}=${cookie.value}`)
          .join("; "),
      );
    }
    if (
      rejectCsrfOnce &&
      path === "/account/profile" &&
      init.method === "PATCH"
    ) {
      headers.delete("X-CSRF-Token");
      rejectCsrfOnce = false;
    }
    const response = await realFetch(url, { ...init, headers });
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    const setCookies = response.headers.getSetCookie();
    for (const cookie of setCookies) {
      const parts = cookie.split(";"),
        pair = parts[0]!,
        index = pair.indexOf("="),
        name = pair.slice(0, index),
        value = pair.slice(index + 1);
      const path =
        parts
          .find((part) => /^\s*Path=/i.test(part))
          ?.trim()
          .slice(5) ?? "/";
      if (
        !value ||
        parts.some((part) => /^\s*Expires=Thu, 01 Jan 1970/i.test(part))
      )
        cookies.delete(name);
      else cookies.set(name, { value, path });
    }
    const payload =
      response.status === 204
        ? null
        : ((await response.clone().json()) as {
            data?: Record<string, unknown>;
          });
    observed.push({
      path,
      status: response.status,
      setCookies,
      data: payload?.data,
    });
    if (losePath === path) {
      losePath = null;
      throw new TypeError(
        "Synthetic response loss AFTER actual server response/commit",
      );
    }
    return response;
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});
describe("Expo Web transport / actual Nest and PostgreSQL browser protocol", () => {
  it("registers without auto login, then logs in with Cookie/CSRF and restores", async () => {
    const registered = await registerAccount({
      account: fixture.account,
      password: password!,
      nickname: "Browser HTTP",
    });
    userId = registered.userId;
    expect(cookies.has("linji_access")).toBe(false);
    expect(cookies.has("linji_refresh")).toBe(false);
    await expect(
      login({ account: fixture.account, password: password! }),
    ).resolves.toMatchObject({ userId });
    const response = observed.find((row) => row.path === "/auth/login")!;
    expect(response.data?.accessToken).toBeUndefined();
    expect(response.data?.refreshToken).toBeUndefined();
    for (const name of ["linji_access", "linji_refresh"]) {
      const cookie = response.setCookies.find((cookie) =>
        cookie.startsWith(name + "="),
      )!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    }
    await expect(restoreSession()).resolves.toMatchObject({ userId });
    const serialized = JSON.stringify([...metadata]);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
  });
  it("rotates once for concurrent access expiry, then verifies CSRF rejection/retry and actual profile persistence", async () => {
    cookies.delete("linji_access");
    const before = observed.filter(
      (row) => row.path === "/auth/refresh",
    ).length;
    await expect(
      Promise.all([apiRequest("/auth/me"), apiRequest("/auth/me")]),
    ).resolves.toEqual([
      expect.objectContaining({ userId }),
      expect.objectContaining({ userId }),
    ]);
    expect(
      observed.filter((row) => row.path === "/auth/refresh").length - before,
    ).toBe(1);
    rejectCsrfOnce = true;
    await expect(
      apiRequest("/account/profile", {
        method: "PATCH",
        body: { nickname: "Browser HTTP verified" },
      }),
    ).resolves.toMatchObject({ nickname: "Browser HTTP verified" });
    expect(
      observed
        .filter((row) => row.path === "/account/profile")
        .map((row) => row.status),
    ).toEqual([403, 200]);
    await expect(apiRequest("/auth/me")).resolves.toMatchObject({
      nickname: "Browser HTTP verified",
    });
  });
  it("changes password and revokes browser and independent native sessions", async () => {
    const nativeResponse = await realFetch(new URL("/api/v1/auth/login", api), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: fixture.account, password }),
    });
    expect(nativeResponse.status).toBe(200);
    const native = (await nativeResponse.json()).data as {
      accessToken: string;
      refreshToken: string;
    };
    expect(native.accessToken).toBeTruthy();
    expect(native.refreshToken).toBeTruthy();
    await apiRequest("/account/password", {
      method: "PATCH",
      body: { currentPassword: password, newPassword: replacement },
      skipAuthRefresh: true,
    });
    await clearSessionTokens();
    await expect(restoreSession()).resolves.toBeNull();
    expect(
      (
        await realFetch(new URL("/api/v1/auth/me", api), {
          headers: { Authorization: `Bearer ${native.accessToken}` },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await realFetch(new URL("/api/v1/auth/refresh", api), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: native.refreshToken }),
        })
      ).status,
    ).toBe(401);
    await expect(
      login({ account: fixture.account, password: replacement! }),
    ).resolves.toMatchObject({ userId });
    await logout();
    expect(cookies.has("linji_refresh")).toBe(false);
    await expect(restoreSession()).resolves.toBeNull();
  });
  it("does not replay a lost logout response or restore after it", async () => {
    await login({ account: fixture.account, password: replacement! });
    losePath = "/auth/logout";
    const count = observed.filter((row) => row.path === "/auth/logout").length;
    await expect(logout()).rejects.toMatchObject({ status: 0 });
    expect(browserSessionBlocked()).toBe(true);
    expect(sessionBoundaryMessage()).toContain("尚未确认");
    await expect(restoreSession()).rejects.toThrow("尚未确认");
    expect(
      observed.filter((row) => row.path === "/auth/logout").length - count,
    ).toBe(1);
    expect(cookies.has("linji_refresh")).toBe(false);
  });
  it("does not replay a lost successful rotation even when the server session remains active", async () => {
    await login({ account: fixture.account, password: replacement! });
    cookies.delete("linji_access");
    losePath = "/auth/refresh";
    const count = observed.filter((row) => row.path === "/auth/refresh").length;
    await expect(apiRequest("/auth/me")).rejects.toMatchObject({ status: 0 });
    expect(browserSessionBlocked()).toBe(true);
    expect(sessionBoundaryMessage()).toContain("尚未确认");
    await expect(restoreSession()).rejects.toThrow("尚未确认");
    expect(
      observed.filter((row) => row.path === "/auth/refresh").length - count,
    ).toBe(1);
    expect(cookies.has("linji_refresh")).toBe(true);
  });
});
