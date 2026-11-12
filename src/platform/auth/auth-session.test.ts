import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, refreshMobileSession } from "../api/api-client";
import { login, logout, registerAccount, restoreSession } from "./auth-session";
import {
  beginSessionChange,
  clearSessionTokens,
  readAccessToken,
  readRefreshToken,
  sessionEpoch,
  writeSessionTokens,
} from "./secure-session";
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
vi.mock("../api/api-client", () => ({
  apiRequest: vi.fn(),
  refreshMobileSession: vi.fn(),
}));
const user = {
  userId: 7,
  account: "snow",
  nickname: "Snow",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [],
  permissionKeys: [],
};
const session = {
  accessToken: "new-access",
  refreshToken: "new-refresh",
  currentUser: user,
  accessTokenExpiresAt: "2026-10-31T01:00:00Z",
  sessionExpiresAt: "2026-11-07T01:00:00Z",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  vi.clearAllMocks();
  native.getItemAsync.mockImplementation(async () => native.token);
  native.setItemAsync.mockImplementation(async (_key, value) => {
    native.token = value;
  });
  native.deleteItemAsync.mockImplementation(async () => {
    native.token = null;
  });
  await clearSessionTokens();
  vi.mocked(apiRequest).mockResolvedValue({ loggedOut: true });
  vi.mocked(refreshMobileSession).mockResolvedValue(null);
});
describe("mobile auth session lifetime", () => {
  it("joins an in-flight login during provider restoration instead of rotating empty credentials", async () => {
    const remote = deferred<unknown>();
    vi.mocked(apiRequest).mockReturnValueOnce(remote.promise);
    const first = login({ account: "snow", password: "password" });
    const restored = restoreSession();
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledOnce());
    remote.resolve(session);
    await expect(restored).resolves.toEqual(user);
    await first;
    expect(refreshMobileSession).not.toHaveBeenCalled();
    expect(native.token).toBe("new-refresh");
  });
  it("shares duplicate logout calls before secure storage and HTTP complete", async () => {
    await writeSessionTokens("old-access", "opaque-refresh");
    const remote = deferred<unknown>();
    vi.mocked(apiRequest).mockReturnValueOnce(remote.promise);
    const first = logout(),
      second = logout();
    expect(second).toBe(first);
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledOnce());
    remote.resolve({ loggedOut: true });
    await Promise.all([first, second]);
    expect(apiRequest).toHaveBeenCalledOnce();
    expect(native.token).toBeNull();
  });
  it("invalidates access immediately, sends only captured credentials and clears storage before logout HTTP", async () => {
    await writeSessionTokens("old-access", "opaque-refresh");
    vi.mocked(apiRequest).mockImplementation(async () => {
      expect(readAccessToken()).toBeNull();
      expect(native.token).toBeNull();
      return { loggedOut: true };
    });
    const pending = logout();
    expect(readAccessToken()).toBeNull();
    await pending;
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/auth/logout", {
      method: "POST",
      body: { refreshToken: "opaque-refresh" },
      headers: { Authorization: "Bearer old-access" },
      expectedSessionEpoch: sessionEpoch(),
    });
  });
  it("keeps credentials cleared when remote revocation fails", async () => {
    await writeSessionTokens("old", "opaque");
    vi.mocked(apiRequest).mockRejectedValue(new Error("offline"));
    await expect(logout()).rejects.toThrow("offline");
    expect(readAccessToken()).toBeNull();
    expect(native.token).toBeNull();
  });
  it("permits logout with no refresh token", async () => {
    await logout();
    expect(apiRequest).toHaveBeenCalledWith(
      "/auth/logout",
      expect.objectContaining({ method: "POST", body: {} }),
    );
  });
  it("still deletes storage when reading the logout token fails", async () => {
    await writeSessionTokens("old", "opaque");
    native.getItemAsync.mockRejectedValueOnce(new Error("secure read failed"));
    await expect(logout()).rejects.toThrow("secure read failed");
    expect(readAccessToken()).toBeNull();
    expect(native.token).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("does not let a delayed logout completion clear a newer login", async () => {
    await writeSessionTokens("old", "opaque");
    const remote = deferred<unknown>();
    vi.mocked(apiRequest).mockReturnValueOnce(remote.promise);
    const old = logout();
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledOnce());
    vi.mocked(apiRequest).mockResolvedValueOnce(session);
    await login({ account: "new", password: "password" });
    remote.resolve({ loggedOut: true });
    await old;
    expect(readAccessToken()).toBe("new-access");
    await expect(readRefreshToken()).resolves.toBe("new-refresh");
  });
  it("rejects an old login reply after a newer account began login", async () => {
    const first = deferred<unknown>();
    vi.mocked(apiRequest).mockReturnValueOnce(first.promise);
    const old = login({ account: "old", password: "password" });
    const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledOnce());
    vi.mocked(apiRequest).mockResolvedValueOnce(session);
    await login({ account: "new", password: "password" });
    first.resolve({
      ...session,
      accessToken: "stale-access",
      refreshToken: "stale-refresh",
    });
    await rejected;
    expect(readAccessToken()).toBe("new-access");
    expect(native.token).toBe("new-refresh");
  });
  it("does not restore old login credentials after signout", async () => {
    const remote = deferred<unknown>();
    vi.mocked(apiRequest).mockReturnValueOnce(remote.promise);
    const pending = login({ account: "snow", password: "password" });
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledOnce());
    await clearSessionTokens();
    remote.resolve(session);
    await rejected;
    expect(readAccessToken()).toBeNull();
    expect(native.token).toBeNull();
  });
  it("shares the API transport refresh implementation for startup restore", async () => {
    vi.mocked(refreshMobileSession).mockResolvedValue(session);
    await expect(restoreSession()).resolves.toEqual(user);
    expect(refreshMobileSession).toHaveBeenCalledWith(sessionEpoch());
  });
  it("does not automatically log in after registration", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ userId: 7, account: "snow" });
    await registerAccount({
      account: "snow",
      password: "password",
      nickname: "Snow",
    });
    expect(readAccessToken()).toBeNull();
    expect(native.setItemAsync).not.toHaveBeenCalled();
  });
  it("rejects missing mobile credentials without publishing access", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ currentUser: user });
    await expect(
      login({ account: "snow", password: "password" }),
    ).rejects.toThrow("mobile session tokens");
    expect(readAccessToken()).toBeNull();
  });
  it("fails before login HTTP if old credential cleanup fails", async () => {
    native.deleteItemAsync.mockRejectedValueOnce(new Error("delete failed"));
    await expect(
      login({ account: "snow", password: "password" }),
    ).rejects.toThrow("delete failed");
    expect(apiRequest).not.toHaveBeenCalled();
    const next = beginSessionChange();
    await next.ready;
  });
});
