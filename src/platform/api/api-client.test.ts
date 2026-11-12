import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { apiRequest as ApiRequest } from "./api-client";

const authState = vi.hoisted(() => ({
  accessToken: null as string | null,
  refreshToken: null as string | null,
  epoch: 0,
}));

vi.mock("../auth/secure-session", () => ({
  sessionEpoch: () => authState.epoch,
  assertSessionEpoch: (expected: number) => {
    if (expected !== authState.epoch) throw new Error("Session changed");
  },
  SessionChangedError: class extends Error {},
  readAccessToken: () => authState.accessToken,
  readRefreshToken: async () => authState.refreshToken,
  writeSessionTokens: async (accessToken: string, refreshToken: string) => {
    authState.accessToken = accessToken;
    authState.refreshToken = refreshToken;
  },
  clearSessionTokens: async () => {
    authState.epoch++;
    authState.accessToken = null;
    authState.refreshToken = null;
  },
}));

describe("apiRequest", () => {
  let apiRequest: typeof ApiRequest;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://localhost:8080/api/v1");
    ({ apiRequest } = await import("./api-client"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    authState.accessToken = null;
    authState.refreshToken = null;
  });

  it("resolves API-relative paths and unwraps the common response envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          msg: "success",
          data: { status: "ok" },
          traceId: "trace-1",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest<{ status: string }>("/health?verbose=true"),
    ).resolves.toEqual({
      status: "ok",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toEqual(
      new URL("http://localhost:8080/api/v1/health?verbose=true"),
    );
  });

  it("serializes JSON bodies and preserves caller headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 201,
          msg: "success",
          data: { id: 4 },
          traceId: "trace-2",
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/dynamics", {
      method: "POST",
      body: { content: "First day on snow" },
      headers: { "x-request-id": "request-1" },
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(init.body).toBe(JSON.stringify({ content: "First day on snow" }));
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-request-id")).toBe("request-1");
  });

  it("preserves multipart FormData without forcing JSON content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 201,
          msg: "success",
          data: { assetId: "asset-7", status: "ready" },
          traceId: "trace-upload",
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.append(
      "file",
      new Blob(["image-bytes"], { type: "image/jpeg" }),
      "slope.jpg",
    );

    await expect(
      apiRequest<{ assetId: string; status: string }>("/assets", {
        method: "POST",
        body: form,
      }),
    ).resolves.toEqual({ assetId: "asset-7", status: "ready" });

    expect(fetchMock.mock.calls[0]?.[0]).toEqual(
      new URL("http://localhost:8080/api/v1/assets"),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).has("content-type")).toBe(false);
  });

  it("accepts a successful 204 response without an envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(
      apiRequest<void>("/me/favorites/resort/12", { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });

  it("exposes the server error code, details and trace ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 404,
            msg: "Not found",
            data: null,
            traceId: "trace-404",
            details: [
              {
                field: "resortId",
                code: "NOT_FOUND",
                message: "Unknown resort",
              },
            ],
          }),
          { status: 404 },
        ),
      ),
    );

    await expect(apiRequest("/resorts/999")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      code: 404,
      message: "Not found",
      traceId: "trace-404",
      details: [
        { field: "resortId", code: "NOT_FOUND", message: "Unknown resort" },
      ],
    });
  });

  it("rejects malformed success envelopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"data":{}}', { status: 200 })),
    );

    await expect(apiRequest("/health")).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      message: "Invalid API response",
    });
  });

  it.each([
    "../admin/users",
    "%2e%2e/admin/users",
    "http://localhost:8080/api/v1/admin/users",
    "//localhost:8080/api/v1/admin/users",
  ])("rejects API paths outside the configured base: %s", async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest(path)).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "http://user:password@localhost:8080/api/v1",
    "http://localhost:8080/api/v1?token=secret",
    "http://localhost:8080/api/v1#fragment",
    "ftp://localhost:8080/api/v1",
  ])("rejects an unsafe API base URL: %s", async (baseUrl) => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", baseUrl);
    vi.resetModules();
    ({ apiRequest } = await import("./api-client"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/health")).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wraps network failures without retrying the request", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/health")).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      message: "Network request failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends only the in-memory access token and omits browser cookies", async () => {
    authState.accessToken = "memory-access-token";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          msg: "success",
          data: { ok: true },
          traceId: "trace-auth",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/auth/me");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer memory-access-token",
    );
    expect(init.credentials).toBe("omit");
  });

  it("rotates the SecureStore refresh token and retries once after an access 401", async () => {
    authState.accessToken = "expired-access";
    authState.refreshToken = "opaque-refresh";
    const envelope = (status: number, data: unknown) =>
      new Response(
        JSON.stringify({
          code: status,
          msg: status === 401 ? "Unauthorized" : "success",
          data,
          traceId: `trace-${status}`,
        }),
        { status },
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(envelope(401, null))
      .mockResolvedValueOnce(
        envelope(200, {
          accessToken: "fresh-access",
          refreshToken: "rotated-refresh",
          accessTokenExpiresAt: "2026-10-27T00:15:00.000Z",
          currentUser: {},
        }),
      )
      .mockResolvedValueOnce(envelope(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest<{ ok: boolean }>("/resorts")).resolves.toEqual({
      ok: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refreshInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(refreshInit.body).toBe(
      JSON.stringify({ refreshToken: "opaque-refresh" }),
    );
    expect(authState.accessToken).toBe("fresh-access");
    expect(authState.refreshToken).toBe("rotated-refresh");
    const retryInit = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(new Headers(retryInit.headers).get("authorization")).toBe(
      "Bearer fresh-access",
    );
  });

  it("does not refresh or retry requests that opt out of auth refresh", async () => {
    authState.accessToken = "valid-session-token";
    authState.refreshToken = "opaque-refresh-token";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 401,
          msg: "Current password is invalid",
          data: null,
          traceId: "trace-password",
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest<void>("/account/password", {
        method: "PATCH",
        body: {
          currentPassword: "wrong-password",
          newPassword: "new-password",
        },
        skipAuthRefresh: true,
      }),
    ).rejects.toMatchObject({ status: 401, traceId: "trace-password" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init).not.toHaveProperty("skipAuthRefresh");
    expect(authState.refreshToken).toBe("opaque-refresh-token");
  });
});

describe("apiStreamRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    authState.accessToken = null;
    authState.refreshToken = null;
  });
  it("refreshes once before SSE starts and preserves the original idempotent body", async () => {
    vi.resetModules();
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://localhost:8080/api/v1");
    authState.accessToken = "expired";
    authState.refreshToken = "refresh";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 401,
            msg: "expired",
            data: null,
            traceId: "t",
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: { accessToken: "new-access", refreshToken: "new-refresh" },
            traceId: "t",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response("event: completed\ndata: {}\n\n", {
          headers: { "content-type": "text/event-stream" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { apiStreamRequest } = await import("./api-client");
    const body = { clientRequestId: "same", content: "snow" };
    const result = await apiStreamRequest("/ai/conversations/id/messages", {
      method: "POST",
      body,
    });
    expect(result.headers.get("content-type")).toBe("text/event-stream");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1].body).toBe(
      fetchMock.mock.calls[2]?.[1].body,
    );
    expect(
      new Headers(fetchMock.mock.calls[2]?.[1].headers).get("authorization"),
    ).toBe("Bearer new-access");
    expect(
      new Headers(fetchMock.mock.calls[2]?.[1].headers).get("accept"),
    ).toBe("text/event-stream");
    await result.body?.cancel();
  });
});
