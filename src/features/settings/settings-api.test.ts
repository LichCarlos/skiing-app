import { beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../platform/api/api-client";
import {
  clearSessionTokens,
  sessionEpoch,
  readAccessToken,
  readRefreshToken,
  writeSessionTokens,
  beginSessionChange,
} from "../../platform/auth/secure-session";
import {
  changeOwnPassword,
  finishSettingsSession,
  verifySettingsAccount,
} from "./settings-api";
const user = { userId: 7, permissionKeys: ["account:password:update"] };
beforeEach(async () => {
  native.deleteItemAsync.mockImplementation(async () => {
    native.token = null;
  });
  await clearSessionTokens();
  vi.clearAllMocks();
});
describe("settings transport and credential lifetime", () => {
  it("checks the authenticated account with no-store and the captured credential epoch", async () => {
    vi.mocked(apiRequest).mockResolvedValue(user);
    const signal = new AbortController().signal,
      epoch = sessionEpoch();
    await verifySettingsAccount(7, epoch, signal);
    expect(apiRequest).toHaveBeenCalledWith("/auth/me", {
      signal,
      cache: "no-store",
      expectedSessionEpoch: epoch,
    });
  });
  it.each([
    { ...user, userId: 8 },
    { ...user, permissionKeys: [] },
  ])("rejects a different account or removed action %#", async (value) => {
    vi.mocked(apiRequest).mockResolvedValue(value);
    await expect(
      verifySettingsAccount(7, sessionEpoch(), new AbortController().signal),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("does not lookup identity after blur", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      verifySettingsAccount(7, sessionEpoch(), abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("sends exactly one password command without auth retry and under the captured epoch", async () => {
    vi.mocked(apiRequest).mockResolvedValue(undefined);
    const body = { currentPassword: " old ", newPassword: " new-password " },
      epoch = sessionEpoch(),
      signal = new AbortController().signal;
    await changeOwnPassword(body, epoch, signal);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith("/account/password", {
      method: "PATCH",
      body,
      signal,
      skipAuthRefresh: true,
      expectedSessionEpoch: epoch,
    });
  });
  it("confirmed 204 clears both local credentials without another remote command", async () => {
    await writeSessionTokens("access", "refresh");
    const epoch = sessionEpoch();
    const ports = { logout: vi.fn(async () => {}), navigate: vi.fn() };
    await finishSettingsSession("changed", epoch, ports);
    expect(readAccessToken()).toBeNull();
    expect(await readRefreshToken()).toBeNull();
    expect(ports.logout).not.toHaveBeenCalled();
    expect(ports.navigate).toHaveBeenCalledWith("changed");
  });
  it("an obsolete epoch cannot log out or navigate a newer account", async () => {
    const epoch = sessionEpoch();
    await beginSessionChange().ready;
    await writeSessionTokens("new-access", "new-refresh");
    const ports = { logout: vi.fn(async () => {}), navigate: vi.fn() };
    await finishSettingsSession("unconfirmed", epoch, ports);
    expect(ports.logout).not.toHaveBeenCalled();
    expect(ports.navigate).not.toHaveBeenCalled();
    expect(readAccessToken()).toBe("new-access");
  });
  it("navigates immediately after invalidation even if native deletion is delayed", async () => {
    let release!: () => void;
    native.deleteItemAsync.mockImplementationOnce(
      () =>
        new Promise<void>((yes) => {
          release = yes;
        }),
    );
    const ports = { logout: vi.fn(async () => {}), navigate: vi.fn() };
    const epoch = sessionEpoch(),
      work = finishSettingsSession("changed", epoch, ports);
    expect(ports.navigate).toHaveBeenCalledWith("changed");
    expect(sessionEpoch()).toBe(epoch + 1);
    await vi.waitFor(() => expect(native.deleteItemAsync).toHaveBeenCalled());
    release();
    await work;
  });
  it("failed native deletion leaves access disabled and refresh unreadable", async () => {
    await writeSessionTokens("access", "refresh");
    native.deleteItemAsync.mockRejectedValueOnce(new Error("device locked"));
    const ports = { logout: vi.fn(async () => {}), navigate: vi.fn() };
    await expect(
      finishSettingsSession("changed", sessionEpoch(), ports),
    ).resolves.toBeUndefined();
    expect(readAccessToken()).toBeNull();
    expect(await readRefreshToken()).toBeNull();
    expect(ports.navigate).toHaveBeenCalledWith("changed");
  });
  it("unknown result uses existing logout instead of password probing", async () => {
    const epoch = sessionEpoch(),
      ports = {
        logout: vi.fn(async () => {
          await clearSessionTokens(epoch);
        }),
        navigate: vi.fn(),
      };
    await finishSettingsSession("unconfirmed", epoch, ports);
    expect(ports.logout).toHaveBeenCalledTimes(1);
    expect(ports.navigate).toHaveBeenCalledWith("unconfirmed");
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
