import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Client from "./api-client";
import type * as Tokens from "../auth/secure-session";
const native = vi.hoisted(() => ({
  token: null as string | null,
  getItemAsync: vi.fn(async (): Promise<string | null> => native.token),
  setItemAsync: vi.fn(async (_key: string, value: string) => {
    native.token = value;
  }),
  deleteItemAsync: vi.fn(async () => {
    native.token = null;
  }),
}));
vi.mock("expo-secure-store", () => native);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function response(status: number, data: unknown = null) {
  return new Response(
    JSON.stringify({ code: status, msg: "result", data, traceId: "trace" }),
    { status },
  );
}
const refreshed = {
  accessToken: "fresh-access",
  refreshToken: "fresh-refresh",
  currentUser: { userId: 7 },
};
let api: typeof Client, tokens: typeof Tokens;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://localhost:8080/api/v1");
  native.token = null;
  native.getItemAsync.mockImplementation(async () => native.token);
  native.setItemAsync.mockImplementation(async (_key, value) => {
    native.token = value;
  });
  native.deleteItemAsync.mockImplementation(async () => {
    native.token = null;
  });
  [api, tokens] = await Promise.all([
    import("./api-client"),
    import("../auth/secure-session"),
  ]);
  await tokens.writeSessionTokens("expired", "opaque");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("real mobile transport and credential store races", () => {
  it("coalesces concurrent JSON 401s and startup restore into one token rotation", async () => {
    const rotation = deferred<Response>();
    const fetch = vi.fn((url: URL, init: RequestInit) => {
      if (url.pathname.endsWith("/auth/refresh")) return rotation.promise;
      return Promise.resolve(
        response(
          new Headers(init.headers).get("Authorization") === "Bearer expired"
            ? 401
            : 200,
          { ok: true },
        ),
      );
    });
    vi.stubGlobal("fetch", fetch);
    const first = api.apiRequest("/me/favorites"),
      second = api.apiRequest("/auth/me"),
      restored = api.refreshMobileSession();
    await vi.waitFor(() =>
      expect(
        fetch.mock.calls.filter(([url]) =>
          url.pathname.endsWith("/auth/refresh"),
        ),
      ).toHaveLength(1),
    );
    rotation.resolve(response(200, refreshed));
    await Promise.all([first, second, restored]);
    expect(
      fetch.mock.calls.filter(([url]) =>
        url.pathname.endsWith("/auth/refresh"),
      ),
    ).toHaveLength(1);
    expect(native.token).toBe("fresh-refresh");
    expect(tokens.readAccessToken()).toBe("fresh-access");
  });
  it("a late 401 for the previous access token reuses the already rotated access token", async () => {
    const late = deferred<Response>();
    let oldCalls = 0;
    const fetch = vi.fn((url: URL, init: RequestInit) => {
      if (url.pathname.endsWith("/auth/refresh"))
        return Promise.resolve(response(200, refreshed));
      if (new Headers(init.headers).get("Authorization") === "Bearer expired") {
        oldCalls++;
        return oldCalls === 1 ? Promise.resolve(response(401)) : late.promise;
      }
      return Promise.resolve(response(200, { ok: true }));
    });
    vi.stubGlobal("fetch", fetch);
    const first = api.apiRequest("/first"),
      second = api.apiRequest("/second");
    await first;
    late.resolve(response(401));
    await second;
    expect(
      fetch.mock.calls.filter(([url]) =>
        url.pathname.endsWith("/auth/refresh"),
      ),
    ).toHaveLength(1);
  });
  it.each([200, 401, 503])(
    "does not let old refresh status %s restore or erase a newer login",
    async (status) => {
      const rotation = deferred<Response>();
      vi.stubGlobal(
        "fetch",
        vi.fn(() => rotation.promise),
      );
      const old = api.refreshMobileSession();
      const rejected = expect(old).rejects.toMatchObject({
        name: "AbortError",
      });
      await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledOnce());
      const change = tokens.beginSessionChange();
      await change.ready;
      await tokens.writeSessionTokens("account-B", "refresh-B", change.epoch);
      rotation.resolve(response(status, status === 200 ? refreshed : null));
      await rejected;
      expect(tokens.readAccessToken()).toBe("account-B");
      expect(native.token).toBe("refresh-B");
    },
  );
  it("ignores a late successful JSON response from the previous session", async () => {
    const remote = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => remote.promise),
    );
    const old = api.apiRequest("/auth/me");
    const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    await tokens.clearSessionTokens();
    remote.resolve(response(200, { userId: 7, private: true }));
    await rejected;
  });
  it("cancels an unconsumed stale SSE body rather than exposing the previous account's stream", async () => {
    const remote = deferred<Response>(),
      cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => remote.promise),
    );
    const old = api.apiStreamRequest("/ai/conversations/id/messages", {
      method: "POST",
      body: {},
    });
    const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    await tokens.clearSessionTokens();
    remote.resolve(
      new Response(new ReadableStream({ cancel }), {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("an aborted waiter cannot retry a write after the shared refresh finishes", async () => {
    const rotation = deferred<Response>();
    const controller = new AbortController();
    const fetch = vi.fn((url: URL) =>
      url.pathname.endsWith("/auth/refresh")
        ? rotation.promise
        : Promise.resolve(response(401)),
    );
    vi.stubGlobal("fetch", fetch);
    const request = api.apiRequest("/dynamics", {
      method: "POST",
      body: { content: "snow" },
      signal: controller.signal,
    });
    const rejected = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const shared = api.refreshMobileSession();
    controller.abort();
    await rejected;
    rotation.resolve(response(200, refreshed));
    await shared;
    expect(
      fetch.mock.calls.filter(([url]) => url.pathname.endsWith("/dynamics")),
    ).toHaveLength(1);
    expect(native.token).toBe("fresh-refresh");
  });
  it("invalidates current credentials after refresh rejection and does not retry the protected request", async () => {
    const changed = vi.fn();
    const unsubscribe = tokens.subscribeSessionChange(changed);
    const fetch = vi.fn(async () => response(401));
    vi.stubGlobal("fetch", fetch);
    await expect(api.apiRequest("/auth/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(tokens.readAccessToken()).toBeNull();
    expect(native.token).toBeNull();
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe();
  });
  it("does not poison a newer session's refresh flight when an old one finishes last", async () => {
    const old = deferred<Response>(),
      next = deferred<Response>();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    vi.stubGlobal("fetch", fetch);
    const first = api.refreshMobileSession();
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const change = tokens.beginSessionChange();
    await change.ready;
    await tokens.writeSessionTokens("B", "B-refresh", change.epoch);
    const second = api.refreshMobileSession();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    old.resolve(response(401));
    await rejected;
    const joined = api.refreshMobileSession();
    expect(joined).toBe(second);
    next.resolve(
      response(200, {
        ...refreshed,
        accessToken: "B-new",
        refreshToken: "B-new-refresh",
      }),
    );
    await second;
    expect(tokens.readAccessToken()).toBe("B-new");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not forward internal epoch and retry switches to native fetch", async () => {
    const fetch = vi.fn(async (_url: URL, _init: RequestInit) =>
      response(200, {}),
    );
    vi.stubGlobal("fetch", fetch);
    await api.apiRequest("/health", {
      expectedSessionEpoch: tokens.sessionEpoch(),
      skipAuthRefresh: true,
    });
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("expectedSessionEpoch");
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("skipAuthRefresh");
  });
});
