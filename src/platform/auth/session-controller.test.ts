import { describe, expect, it, vi } from "vitest";
import { SessionController } from "./session-controller";
import { ApiError } from "../api/api-error";
const user = {
  userId: 7,
  account: "snow",
  nickname: "Snow",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [],
  permissionKeys: ["ai:conversation:use"],
};
const other = { ...user, userId: 8, account: "other" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  let notify = () => {};
  const ports = {
    login: vi.fn(async () => user),
    logout: vi.fn(async () => {}),
    restore: vi.fn(async (): Promise<typeof user | null> => null),
    profile: vi.fn(async (_signal?: AbortSignal) => user),
    changed: vi.fn(),
    subscribe: vi.fn((listener: () => void) => {
      notify = listener;
      return () => {
        notify = () => {};
      };
    }),
  };
  const controller = new SessionController(ports);
  controller.activate();
  return { controller, ports, boundary: () => notify() };
}
describe("mobile session UI ownership", () => {
  it("retains a browser boundary warning when a refresh response is uncertain", async () => {
    let notify = () => {};
    const controller = new SessionController({
      login: async () => user,
      logout: async () => {},
      restore: async () => {
        notify();
        throw new Error("lost rotation");
      },
      profile: async () => user,
      subscribe: (listener) => {
        notify = listener;
        return () => {};
      },
      boundaryMessage: () => "浏览器会话结果尚未确认，请重新登录。",
      changed: () => {},
    });
    controller.activate();
    await controller.restore();
    expect(controller.snapshot()).toEqual({
      user: null,
      status: "anonymous",
      restoreError: "浏览器会话结果尚未确认，请重新登录。",
    });
    controller.dispose();
  });
  it("a restore retry cannot supersede an in-flight explicit login", async () => {
    const { controller, ports } = setup();
    const remote = deferred<typeof user>();
    ports.login.mockReturnValue(remote.promise);
    const login = controller.signIn({ account: "snow", password: "password" });
    await controller.restore();
    expect(ports.restore).not.toHaveBeenCalled();
    remote.resolve(user);
    await login;
    expect(controller.snapshot().user).toEqual(user);
  });
  it("retains a truthful cleanup/revocation warning after logout fails", async () => {
    const { controller, ports } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    ports.logout.mockRejectedValue(new Error("native delete failed"));
    await expect(controller.signOut()).rejects.toThrow("native delete failed");
    expect(controller.snapshot()).toMatchObject({
      user: null,
      status: "anonymous",
    });
    expect(controller.snapshot().restoreError).toContain(
      "设备凭证清理或服务端退出尚未确认",
    );
  });
  it("does not let startup restore overwrite a later sign-in", async () => {
    const { controller, ports, boundary } = setup();
    const restored = deferred<typeof user | null>();
    ports.restore.mockReturnValue(restored.promise);
    const first = controller.restore();
    ports.login.mockImplementation(async () => {
      boundary();
      return other;
    });
    await controller.signIn({ account: "other", password: "password" });
    restored.resolve(user);
    await first;
    expect(controller.snapshot().user).toEqual(other);
  });
  it("ignores old restore errors after a newer login", async () => {
    const { controller, ports } = setup();
    const restored = deferred<typeof user | null>();
    ports.restore.mockReturnValue(restored.promise);
    const first = controller.restore();
    await controller.signIn({ account: "snow", password: "password" });
    restored.reject(new Error("old offline"));
    await first;
    expect(controller.snapshot()).toMatchObject({
      status: "authenticated",
      restoreError: null,
    });
  });
  it("does not let a delayed logout completion erase a newer user", async () => {
    const { controller, ports } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    const remote = deferred<void>();
    ports.logout.mockReturnValue(remote.promise);
    const old = controller.signOut();
    const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    ports.login.mockResolvedValue(other);
    await controller.signIn({ account: "other", password: "password" });
    remote.resolve();
    await rejected;
    expect(controller.snapshot().user).toEqual(other);
  });
  it("invalidates visible identity synchronously on a transport credential boundary", async () => {
    const { controller, boundary } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    boundary();
    expect(controller.snapshot()).toEqual({
      user: null,
      status: "anonymous",
      restoreError: null,
    });
  });
  it("does not publish a stale sign-in even if an adapter ignored credential fencing", async () => {
    const { controller, ports, boundary } = setup();
    const remote = deferred<typeof user>();
    ports.login.mockReturnValue(remote.promise);
    const old = controller.signIn({ account: "snow", password: "password" });
    const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    boundary();
    remote.resolve(user);
    await rejected;
    expect(controller.snapshot().user).toBeNull();
  });
  it("unsubscribes and ignores results from a disposed provider lifetime", async () => {
    const { controller, ports } = setup();
    const remote = deferred<typeof user | null>();
    ports.restore.mockReturnValue(remote.promise);
    const old = controller.restore();
    controller.dispose();
    const updates = ports.changed.mock.calls.length;
    remote.resolve(user);
    await old;
    expect(ports.changed.mock.calls.length).toBe(updates);
    controller.activate();
    ports.restore.mockResolvedValue(other);
    await controller.restore();
    expect(controller.snapshot().user).toEqual(other);
  });
  it("publishes complete refreshed grants for the same account", async () => {
    const { controller, ports } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    ports.profile.mockResolvedValue({
      ...user,
      nickname: "Changed",
      permissionKeys: [],
    });
    await controller.refreshProfile();
    expect(controller.snapshot().user).toMatchObject({
      nickname: "Changed",
      permissionKeys: [],
    });
  });
  it("does not overwrite newer grants with an older profile read", async () => {
    const { controller, ports } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    const first = deferred<typeof user>();
    ports.profile.mockReturnValueOnce(first.promise);
    const older = controller.refreshProfile();
    const rejected = expect(older).rejects.toMatchObject({
      name: "AbortError",
    });
    ports.profile.mockResolvedValueOnce({
      ...user,
      nickname: "Current",
      permissionKeys: [],
    });
    await controller.refreshProfile();
    first.resolve(user);
    await rejected;
    expect(controller.snapshot().user).toMatchObject({
      nickname: "Current",
      permissionKeys: [],
    });
  });
  it("does not overwrite a profile edit committed after the read began", async () => {
    const { controller, ports } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    const first = deferred<typeof user>();
    ports.profile.mockReturnValueOnce(first.promise);
    const older = controller.refreshProfile();
    const rejected = expect(older).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.applyProfile({
      userId: 7,
      account: "snow",
      nickname: "Edited",
      avatarAssetId: null,
      avatarUrl: null,
    });
    first.resolve(user);
    await rejected;
    expect(controller.snapshot().user?.nickname).toBe("Edited");
  });
  it("does not use an old account's logout intent against the new account", async () => {
    const { controller, ports } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    ports.login.mockResolvedValue(other);
    await controller.signIn({ account: "other", password: "password" });
    await expect(
      controller.signOut({ userId: 7, account: "snow" }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(ports.logout).not.toHaveBeenCalled();
    expect(controller.snapshot().user).toEqual(other);
  });
  it("does not let a stale logout interrupt a newer in-flight login", async () => {
    const { controller, ports } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    const remote = deferred<typeof user>();
    ports.login.mockReturnValue(remote.promise);
    const login = controller.signIn({ account: "other", password: "password" });
    await expect(
      controller.signOut({ userId: 7, account: "snow" }),
    ).rejects.toMatchObject({ name: "AbortError" });
    remote.resolve(other);
    await login;
    expect(ports.logout).not.toHaveBeenCalled();
    expect(controller.snapshot().user).toEqual(other);
  });
  it("cancels a profile read without publishing an adapter's late result", async () => {
    const { controller, ports } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    const remote = deferred<typeof user>();
    ports.profile.mockReturnValue(remote.promise);
    const cancellation = new AbortController();
    const read = controller.refreshProfile(cancellation.signal);
    const rejected = expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(ports.profile).toHaveBeenCalledWith(cancellation.signal);
    cancellation.abort();
    remote.resolve({ ...user, nickname: "Late" });
    await rejected;
    expect(controller.snapshot().user?.nickname).toBe("Snow");
  });
  it("does not start a profile read for an already aborted signal", async () => {
    const { controller, ports } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    const cancellation = new AbortController();
    cancellation.abort();
    await expect(
      controller.refreshProfile(cancellation.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(ports.profile).not.toHaveBeenCalled();
  });
  it("ignores an edit projection with the wrong account even when its userId matches", async () => {
    const { controller } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    controller.applyProfile({
      userId: 7,
      account: "other",
      nickname: "Wrong",
      avatarAssetId: null,
      avatarUrl: null,
    });
    expect(controller.snapshot().user?.nickname).toBe("Snow");
  });
  it.each([
    null,
    { ...user, userId: 0 },
    { ...user, nickname: " " },
    { ...user, avatarUrl: 7 },
    { ...user, roles: [{ roleKey: "role" }] },
    { ...user, permissionKeys: [7] },
    { ...user, merchant: {} },
    { ...user, menuTree: null },
  ])(
    "rejects malformed refreshed profile %# before publishing it",
    async (profile) => {
      const { controller, ports } = setup();
      await controller.signIn({ account: "snow", password: "password" });
      ports.profile.mockResolvedValue(profile as typeof user);
      await expect(controller.refreshProfile()).rejects.toThrow("资料响应无效");
      expect(controller.snapshot().user).toEqual(user);
    },
  );
  it("rejects a profile for another account", async () => {
    const { controller, ports } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    ports.profile.mockResolvedValue(other);
    await expect(controller.refreshProfile()).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(controller.snapshot().user).toEqual(user);
  });
  it("rejects a profile reply from a former session of the same account", async () => {
    const { controller, ports, boundary } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    const remote = deferred<typeof user>();
    ports.profile.mockReturnValue(remote.promise);
    const old = controller.refreshProfile();
    const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    boundary();
    await controller.signIn({ account: "snow", password: "password" });
    remote.resolve({ ...user, nickname: "Old profile" });
    await rejected;
    expect(controller.snapshot().user?.nickname).toBe("Snow");
  });
  it("only merges nickname/avatar from the profile-edit projection", async () => {
    const { controller } = setup();
    await controller.signIn({ account: "snow", password: "password" });
    controller.applyProfile({
      userId: 7,
      account: "snow",
      nickname: "Edited",
      avatarAssetId: null,
      avatarUrl: null,
    });
    expect(controller.snapshot().user).toMatchObject({
      nickname: "Edited",
      permissionKeys: ["ai:conversation:use"],
    });
  });
  it("allows guest browsing with a recoverable restore error and then retries", async () => {
    const { controller, ports } = setup();
    ports.restore.mockRejectedValue(
      new ApiError("offline", { status: 0, code: null, traceId: null }),
    );
    await controller.restore();
    expect(controller.snapshot()).toMatchObject({
      user: null,
      status: "anonymous",
    });
    expect(controller.snapshot().restoreError).toContain("检查网络");
    controller.clearRestoreError();
    expect(controller.snapshot().restoreError).toBeNull();
    ports.restore.mockResolvedValue(user);
    await controller.restore();
    expect(controller.snapshot().status).toBe("authenticated");
  });
});
