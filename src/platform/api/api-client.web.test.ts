import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => {
  throw new Error("Web must not import SecureStore");
});
const user = {
  userId: 7,
  account: "snow",
  nickname: "Snow",
  avatarUrl: null,
  merchant: null,
  roles: [],
  menuTree: [],
  permissionKeys: ["account:profile:read"],
};
const session = () => ({
  currentUser: user,
  accessTokenExpiresAt: "2026-11-02T12:15:00Z",
  sessionExpiresAt: "2026-11-09T12:00:00Z",
});
const key = "linji.expo.session.v1:http://localhost:8080/api/v1";
const input = { account: "snow", password: "synthetic-password" };
function envelope(data: unknown, status = 200, msg = "success") {
  return new Response(
    JSON.stringify({ code: status, msg, data, traceId: "browser-test" }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
let store: Map<string, string>;
let events: EventTarget;
let api: typeof import("./api-client.web");
let auth: typeof import("../auth/auth-session.web");
let boundary: typeof import("../auth/browser-session");
let locks: { request: ReturnType<typeof vi.fn> };
let localStorage: {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};
let fetchMock: ReturnType<typeof vi.fn>;
function path(url: URL) {
  return url.pathname.replace("/api/v1", "");
}
function externalRevision(blocked = true) {
  store.set(key, JSON.stringify({ revision: crypto.randomUUID(), blocked }));
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: key });
  events.dispatchEvent(event);
}
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://localhost:8080/api/v1");
  store = new Map();
  events = new EventTarget();
  localStorage = {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v);
    }),
  };
  let queue: Promise<unknown> = Promise.resolve();
  locks = {
    request: vi.fn(
      (
        _key: string,
        options: { signal?: AbortSignal },
        work: () => Promise<unknown>,
      ) => {
        const result = queue.then(() => {
          options.signal?.throwIfAborted();
          return work();
        });
        queue = result.catch(() => undefined);
        return result;
      },
    ),
  };
  vi.stubGlobal("window", {
    localStorage,
    crypto,
    navigator: { locks },
    addEventListener: events.addEventListener.bind(events),
  });
  fetchMock = vi.fn(async (url: URL) =>
    envelope(path(url) === "/auth/csrf" ? { csrfToken: "fresh-csrf" } : user),
  );
  vi.stubGlobal("fetch", fetchMock);
  api = await import("./api-client.web");
  auth = await import("../auth/auth-session.web");
  boundary = await import("../auth/browser-session");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Expo browser Cookie/CSRF transport", () => {
  it("keeps public catalog browsing available after guest restore while retaining POST CSRF", async () => {
    await boundary.clearSessionTokens();
    fetchMock.mockImplementation(async (url: URL) =>
      envelope(path(url) === "/auth/csrf" ? { csrfToken: "catalog-csrf" } : []),
    );
    await api.apiRequest("/catalog/ski_resort/fields");
    expect(fetchMock.mock.calls[0]![1].credentials).toBe("omit");
    await api.apiRequest("/catalog/ski_resort/query", {
      method: "POST",
      body: { page: 1 },
    });
    const last = fetchMock.mock.calls.at(-1)![1] as RequestInit;
    expect(last.credentials).toBe("include");
    expect(new Headers(last.headers).get("X-CSRF-Token")).toBe("catalog-csrf");
    const count = fetchMock.mock.calls.length;
    await expect(
      api.apiRequest("/catalog/ski_resort/query", { method: "PATCH" }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(api.apiRequest("/admin/users")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(count);
  });
  it("forces Cookie credentials and strips caller bearer/CSRF credentials", async () => {
    await api.apiRequest("/auth/me", {
      credentials: "omit",
      headers: {
        Authorization: "Bearer forbidden",
        "X-CSRF-Token": "forbidden",
      },
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init).toMatchObject({
      credentials: "include",
      mode: "cors",
      cache: "no-store",
    });
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(new Headers(init.headers).has("X-CSRF-Token")).toBe(false);
  });
  it("requests fresh CSRF inside the lock for each write", async () => {
    await api.apiRequest("/account/profile", {
      method: "PATCH",
      body: { nickname: "New" },
    });
    await api.apiRequest("/dynamics", {
      method: "POST",
      body: { content: "Snow" },
    });
    expect(fetchMock.mock.calls.map((call) => path(call[0]))).toEqual([
      "/auth/csrf",
      "/account/profile",
      "/auth/csrf",
      "/dynamics",
    ]);
    expect(
      new Headers(fetchMock.mock.calls[1]![1].headers).get("X-CSRF-Token"),
    ).toBe("fresh-csrf");
    expect(fetchMock.mock.calls[1]![1].body).toBe('{"nickname":"New"}');
    expect(locks.request).toHaveBeenCalledTimes(2);
  });
  it("preserves multipart boundaries and accepts 204", async () => {
    const form = new FormData();
    form.append("file", new Blob(["image"]), "snow.png");
    fetchMock.mockImplementation(async (url: URL) =>
      path(url) === "/auth/csrf"
        ? envelope({ csrfToken: "csrf" })
        : new Response(null, { status: 204 }),
    );
    await expect(
      api.apiRequest("/assets", { method: "POST", body: form }),
    ).resolves.toBeUndefined();
    const init = fetchMock.mock.calls[1]![1];
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });
  it("retries only an exact CSRF rejection with a new token", async () => {
    let writes = 0,
      csrf = 0;
    fetchMock.mockImplementation(async (url: URL) =>
      path(url) === "/auth/csrf"
        ? envelope({ csrfToken: `csrf-${++csrf}` })
        : ++writes === 1
          ? envelope(null, 403, "CSRF validation failed")
          : envelope({ saved: true }),
    );
    await expect(
      api.apiRequest("/account/profile", {
        method: "PATCH",
        body: { nickname: "New" },
      }),
    ).resolves.toEqual({ saved: true });
    expect(writes).toBe(2);
    expect(csrf).toBe(2);
    expect(
      new Headers(fetchMock.mock.calls[3]![1].headers).get("X-CSRF-Token"),
    ).toBe("csrf-2");
  });
  it.each([403, 409, 500])(
    "does not replay a business rejection %s",
    async (status) => {
      fetchMock.mockImplementation(async (url: URL) =>
        path(url) === "/auth/csrf"
          ? envelope({ csrfToken: "csrf" })
          : envelope(null, status, "Business rejection"),
      );
      await expect(
        api.apiRequest("/account/profile", {
          method: "PATCH",
          body: { nickname: "New" },
        }),
      ).rejects.toMatchObject({ status });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
  it("does not replay an unknown write result", async () => {
    fetchMock.mockImplementation(async (url: URL) => {
      if (path(url) === "/auth/csrf") return envelope({ csrfToken: "csrf" });
      throw new TypeError("connection lost");
    });
    await expect(
      api.apiRequest("/account/profile", {
        method: "PATCH",
        body: { nickname: "New" },
      }),
    ).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("rejects missing browser CSRF instead of sending a native-style write", async () => {
    fetchMock.mockResolvedValue(envelope({ csrfToken: null }));
    await expect(
      auth.registerAccount({ ...input, nickname: "Snow" }),
    ).rejects.toThrow("Origin");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not send registration when its screen aborts during CSRF acquisition", async () => {
    const csrf = deferred<Response>();
    fetchMock.mockReturnValue(csrf.promise);
    const controller = new AbortController();
    const registration = auth.registerAccount(
      { ...input, nickname: "Snow" },
      { signal: controller.signal },
    );
    const rejected = expect(registration).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();
    csrf.resolve(envelope({ csrfToken: "csrf" }));
    await rejected;
    expect(fetchMock.mock.calls.map((call) => path(call[0]))).toEqual([
      "/auth/csrf",
    ]);
  });
  it.each([
    "https://outside.test/api",
    "//outside.test/api",
    "../outside",
    "/../../outside",
  ])("rejects escaped API path %s", async (value) => {
    await expect(api.apiRequest(value)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns SSE once and never consumes its successful body as JSON", async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      path(url) === "/auth/csrf"
        ? envelope({ csrfToken: "csrf" })
        : new Response("event: delta\ndata: snow\n\n", {
            headers: { "Content-Type": "text/event-stream" },
          }),
    );
    const response = await api.apiStreamRequest(
      "/ai/conversations/1/messages",
      { method: "POST", body: { content: "Snow" } },
    );
    expect(await response.text()).toContain("event: delta");
    expect(new Headers(fetchMock.mock.calls[1]![1].headers).get("Accept")).toBe(
      "text/event-stream",
    );
  });
  it("rejects a non-SSE success instead of interpreting JSON as a stream", async () => {
    await expect(
      api.apiStreamRequest("/ai/conversations/1/messages", {
        method: "POST",
        body: { content: "Snow" },
      }),
    ).rejects.toThrow("stream");
  });
});

describe("browser identity and cookie-response ordering", () => {
  it("logs in without JSON tokens, then restores through the access cookie", async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      envelope(
        path(url) === "/auth/csrf"
          ? { csrfToken: "csrf" }
          : path(url) === "/auth/login"
            ? session()
            : user,
      ),
    );
    const initial = boundary.sessionEpoch();
    const login = auth.login(input);
    expect(boundary.sessionEpoch()).toBeGreaterThan(initial);
    await expect(login).resolves.toEqual(user);
    expect(boundary.browserSessionBlocked()).toBe(false);
    await expect(auth.restoreSession()).resolves.toEqual(user);
    expect(fetchMock.mock.calls.map((call) => path(call[0]))).toEqual([
      "/auth/csrf",
      "/auth/login",
      "/auth/me",
    ]);
    const serialized = JSON.stringify([...store]);
    expect(serialized).not.toContain(input.password);
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
    expect(serialized).not.toContain(user.account);
  });
  it.each(["accessToken", "refreshToken"])(
    "quarantines a browser response that leaks %s",
    async (field) => {
      fetchMock.mockImplementation(async (url: URL) =>
        envelope(
          path(url) === "/auth/csrf"
            ? { csrfToken: "csrf" }
            : { ...session(), [field]: "forbidden-token" },
        ),
      );
      await expect(auth.login(input)).rejects.toThrow("浏览器会话响应无效");
      expect(boundary.browserSessionBlocked()).toBe(true);
    },
  );
  it("shares a startup restoration and rotates only once on 401", async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      path(url) === "/auth/me"
        ? envelope(null, 401)
        : envelope(
            path(url) === "/auth/csrf" ? { csrfToken: "csrf" } : session(),
          ),
    );
    const first = auth.restoreSession(),
      second = auth.restoreSession();
    expect(first).toBe(second);
    await expect(first).resolves.toEqual(user);
    expect(fetchMock.mock.calls.map((call) => path(call[0]))).toEqual([
      "/auth/me",
      "/auth/csrf",
      "/auth/refresh",
    ]);
    expect(fetchMock.mock.calls[2]![1].body).toBe("{}");
  });
  it("serializes concurrent 401 requests so only one rotation is needed", async () => {
    let refreshed = false;
    fetchMock.mockImplementation(async (url: URL) => {
      const p = path(url);
      if (p === "/auth/csrf") return envelope({ csrfToken: "csrf" });
      if (p === "/auth/refresh") {
        refreshed = true;
        return envelope(session());
      }
      return refreshed ? envelope(user) : envelope(null, 401);
    });
    await expect(
      Promise.all([
        api.apiRequest("/auth/me"),
        api.apiRequest("/account/profile"),
      ]),
    ).resolves.toEqual([user, user]);
    expect(
      fetchMock.mock.calls.filter((call) => path(call[0]) === "/auth/refresh"),
    ).toHaveLength(1);
  });
  it("a terminal refresh 401 invalidates local identity", async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      path(url) === "/auth/csrf"
        ? envelope({ csrfToken: "csrf" })
        : envelope(null, 401),
    );
    await expect(auth.restoreSession()).resolves.toBeNull();
    expect(boundary.browserSessionBlocked()).toBe(true);
    expect(boundary.sessionBoundaryMessage()).toBeNull();
  });
  it.each(["network", "500", "malformed"])(
    "quarantines unknown refresh result %s across module reload",
    async (mode) => {
      fetchMock.mockImplementation(async (url: URL) => {
        const p = path(url);
        if (p === "/auth/me") return envelope(null, 401);
        if (p === "/auth/csrf") return envelope({ csrfToken: "csrf" });
        if (mode === "network") throw new TypeError("lost");
        return mode === "500" ? envelope(null, 500) : envelope({});
      });
      await expect(auth.restoreSession()).rejects.toThrow();
      expect(boundary.browserSessionBlocked()).toBe(true);
      expect(boundary.sessionBoundaryMessage()).toContain("尚未确认");
      const count = fetchMock.mock.calls.length;
      vi.resetModules();
      const reloaded = await import("../auth/auth-session.web");
      await expect(reloaded.restoreSession()).rejects.toThrow("尚未确认");
      expect(fetchMock).toHaveBeenCalledTimes(count);
    },
  );
  it("does not refresh for skipAuthRefresh or a forbidden response", async () => {
    fetchMock.mockResolvedValue(envelope(null, 401));
    await expect(
      api.apiRequest("/auth/me", { skipAuthRefresh: true }),
    ).rejects.toMatchObject({ status: 401 });
    fetchMock.mockResolvedValue(envelope(null, 403));
    await expect(api.apiRequest("/auth/me")).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("logout blocks synchronously, confirms once, and never restores old cookies", async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      envelope(
        path(url) === "/auth/csrf"
          ? { csrfToken: "csrf" }
          : { loggedOut: true },
      ),
    );
    const first = auth.logout();
    expect(boundary.browserSessionBlocked()).toBe(true);
    expect(auth.logout()).toBe(first);
    await first;
    expect(boundary.sessionBoundaryMessage()).toBeNull();
    vi.resetModules();
    const reloaded = await import("../auth/auth-session.web");
    await expect(reloaded.restoreSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("keeps unknown logout visible after reload and allows only guest public reads", async () => {
    fetchMock.mockImplementation(async (url: URL) => {
      if (path(url) === "/auth/csrf") return envelope({ csrfToken: "csrf" });
      throw new TypeError("lost");
    });
    await expect(auth.logout()).rejects.toMatchObject({ status: 0 });
    vi.resetModules();
    const reloaded = await import("../auth/auth-session.web");
    await expect(reloaded.restoreSession()).rejects.toThrow("尚未确认");
    fetchMock.mockResolvedValue(envelope([]));
    await api.apiRequest("/articles");
    expect(fetchMock.mock.calls.at(-1)![1].credentials).toBe("omit");
    const count = fetchMock.mock.calls.length;
    await expect(api.apiRequest("/me/favorites")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(count);
  });
  it("known password success can clear browser intent without reading or deleting HttpOnly cookies", async () => {
    await boundary.clearSessionTokens();
    expect(boundary.browserSessionBlocked()).toBe(true);
    await expect(auth.restoreSession()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects a late response after an external tab changes identity", async () => {
    const remote = deferred<Response>();
    fetchMock.mockReturnValue(remote.promise);
    const changed = vi.fn();
    boundary.subscribeSessionChange(changed);
    const request = api.apiRequest("/auth/me");
    const rejected = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    externalRevision();
    expect(changed).toHaveBeenCalledTimes(1);
    remote.resolve(envelope(user));
    await rejected;
  });
  it("detects external revision even when a storage event was missed", async () => {
    const expected = boundary.sessionEpoch();
    store.set(key, JSON.stringify({ revision: "other-tab", blocked: false }));
    await expect(
      api.apiRequest("/auth/me", { expectedSessionEpoch: expected }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("waits for an old login cookie response before sending a newer login", async () => {
    const remote = deferred<Response>();
    let logins = 0;
    fetchMock.mockImplementation(async (url: URL) =>
      path(url) === "/auth/csrf"
        ? envelope({ csrfToken: "csrf" })
        : ++logins === 1
          ? remote.promise
          : envelope({
              ...session(),
              currentUser: { ...user, userId: 8, account: "other" },
            }),
    );
    const first = auth.login(input);
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(logins).toBe(1));
    const second = auth.login({ ...input, account: "other" });
    await Promise.resolve();
    expect(logins).toBe(1);
    remote.resolve(envelope(session()));
    await rejected;
    await expect(second).resolves.toMatchObject({ userId: 8 });
    expect(logins).toBe(2);
    expect(boundary.browserSessionBlocked()).toBe(false);
  });
  it("cancels queued requests without sending their fetch", async () => {
    const remote = deferred<Response>();
    fetchMock.mockReturnValue(remote.promise);
    const first = api.apiRequest("/auth/me");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const controller = new AbortController();
    const second = api.apiRequest("/account/profile", {
      signal: controller.signal,
    });
    const rejected = expect(second).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    remote.resolve(envelope(user));
    await first;
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not abort shared cookie rotation when a business caller cancels", async () => {
    const remote = deferred<Response>();
    let rotated = false;
    fetchMock.mockImplementation(async (url: URL) => {
      const p = path(url);
      if (p === "/auth/csrf") return envelope({ csrfToken: "csrf" });
      if (p === "/auth/refresh") {
        rotated = true;
        return remote.promise;
      }
      return envelope(null, 401);
    });
    const controller = new AbortController();
    const work = api.apiRequest("/auth/me", { signal: controller.signal });
    const rejected = expect(work).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(rotated).toBe(true));
    controller.abort();
    expect(fetchMock.mock.calls.at(-1)![1].signal).toBeUndefined();
    remote.resolve(envelope(session()));
    await rejected;
    expect(boundary.browserSessionBlocked()).toBe(false);
  });
  it("does not crash render on denied storage and refuses login safely", async () => {
    localStorage.getItem.mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    localStorage.setItem.mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(() => boundary.sessionEpoch()).not.toThrow();
    expect(boundary.browserSessionBlocked()).toBe(true);
    await expect(auth.login(input)).rejects.toThrow("Denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("can replace a malformed noncredential marker by explicit login", async () => {
    store.set(key, "invalid-json");
    expect(() => boundary.sessionEpoch()).not.toThrow();
    expect(boundary.browserSessionBlocked()).toBe(true);
    fetchMock.mockImplementation(async (url: URL) =>
      envelope(path(url) === "/auth/csrf" ? { csrfToken: "csrf" } : session()),
    );
    await expect(auth.login(input)).resolves.toEqual(user);
    expect(boundary.browserSessionBlocked()).toBe(false);
  });
  it("fails closed when Web Locks are unavailable", async () => {
    vi.stubGlobal("window", { localStorage, crypto, navigator: {} });
    await expect(api.apiRequest("/auth/me")).rejects.toThrow("Web Locks");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("supports server rendering without accessing browser storage", () => {
    vi.stubGlobal("window", undefined);
    expect(() => boundary.sessionEpoch()).not.toThrow();
    expect(localStorage.getItem).not.toHaveBeenCalled();
  });
});
