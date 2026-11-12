import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(async () => null as string | null),
  setItemAsync: vi.fn(async (): Promise<void> => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

vi.mock("expo-secure-store", () => secureStore);

import {
  clearSessionTokens,
  readAccessToken,
  readRefreshToken,
  writeSessionTokens,
  beginSessionChange,
  sessionEpoch,
  subscribeSessionChange,
} from "./secure-session";

describe("mobile secure session storage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    secureStore.getItemAsync.mockResolvedValue(null);
    await clearSessionTokens();
  });

  afterEach(() => vi.restoreAllMocks());

  it("keeps access tokens in memory and stores only refresh tokens securely", async () => {
    await writeSessionTokens("short-access", "opaque-refresh");

    expect(readAccessToken()).toBe("short-access");
    expect(secureStore.setItemAsync).toHaveBeenCalledOnce();
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      "linji.refresh-token",
      "opaque-refresh",
    );
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it("clears the in-memory access and persisted refresh credentials", async () => {
    await writeSessionTokens("short-access", "opaque-refresh");
    await clearSessionTokens();

    expect(readAccessToken()).toBeNull();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      "linji.refresh-token",
    );
  });

  it("cannot publish an in-flight storage write after signout and deletes it afterwards", async () => {
    let finish!: () => void;
    secureStore.setItemAsync.mockReturnValueOnce(
      new Promise<void>((yes) => {
        finish = yes;
      }),
    );
    const epoch = sessionEpoch();
    const pending = writeSessionTokens("late-access", "late-refresh", epoch);
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(secureStore.setItemAsync).toHaveBeenCalled());
    const cleared = clearSessionTokens(epoch);
    expect(readAccessToken()).toBeNull();
    finish();
    await rejected;
    await cleared;
    expect(readAccessToken()).toBeNull();
    expect(
      secureStore.deleteItemAsync.mock.invocationCallOrder.at(-1),
    ).toBeGreaterThan(
      secureStore.setItemAsync.mock.invocationCallOrder.at(-1)!,
    );
  });
  it("an old failure cannot clear the new account", async () => {
    const old = sessionEpoch();
    const change = beginSessionChange();
    await change.ready;
    await writeSessionTokens("new-access", "new-refresh", change.epoch);
    const calls = secureStore.deleteItemAsync.mock.calls.length;
    await clearSessionTokens(old);
    expect(readAccessToken()).toBe("new-access");
    expect(secureStore.deleteItemAsync.mock.calls.length).toBe(calls);
  });
  it("serializes competing native writes so a later account finishes last", async () => {
    let finish!: () => void;
    secureStore.setItemAsync.mockReturnValueOnce(
      new Promise<void>((yes) => {
        finish = yes;
      }),
    );
    const old = writeSessionTokens("old", "old");
    const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(secureStore.setItemAsync).toHaveBeenCalled());
    const change = beginSessionChange();
    const next = change.ready.then(() =>
      writeSessionTokens("new", "new", change.epoch),
    );
    finish();
    await rejected;
    await next;
    expect(readAccessToken()).toBe("new");
    expect(secureStore.setItemAsync).toHaveBeenLastCalledWith(
      "linji.refresh-token",
      "new",
    );
  });
  it("does not wedge the queue after a native write failure", async () => {
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("write failed"));
    await expect(writeSessionTokens("bad", "bad")).rejects.toThrow(
      "write failed",
    );
    expect(readAccessToken()).toBeNull();
    await writeSessionTokens("next", "next");
    expect(readAccessToken()).toBe("next");
  });
  it("keeps a failed-delete token unavailable in the running process", async () => {
    secureStore.deleteItemAsync.mockRejectedValueOnce(new Error("locked"));
    secureStore.getItemAsync.mockResolvedValue("old-persisted");
    await expect(clearSessionTokens()).rejects.toThrow("locked");
    await expect(readRefreshToken()).resolves.toBeNull();
  });
  it("notifies session observers synchronously without exposing any credentials", async () => {
    await writeSessionTokens("old", "opaque");
    const observed = vi.fn(() => expect(readAccessToken()).toBeNull());
    const unsubscribe = subscribeSessionChange(observed);
    const cleared = clearSessionTokens();
    expect(observed).toHaveBeenCalledExactlyOnceWith();
    await cleared;
    unsubscribe();
    await clearSessionTokens();
    expect(observed).toHaveBeenCalledOnce();
  });
});
