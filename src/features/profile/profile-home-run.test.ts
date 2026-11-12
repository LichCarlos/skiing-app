import { describe, expect, it, vi } from "vitest";
import {
  ProfileHomeRun,
  homeTargetAllowed,
  type HomeSession,
} from "./profile-home-run";
const user = {
  userId: 7,
  account: "snow",
  nickname: "Snow",
  avatarUrl: null,
  merchant: null,
  roles: [],
  menuTree: [],
  permissionKeys: [
    "account:profile:read",
    "ai:conversation:use",
    "member:favorite:toggle",
  ],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(guest = false) {
  let session: HomeSession = {
    user: guest ? null : { ...user, permissionKeys: [...user.permissionKeys] },
    status: guest ? "anonymous" : "authenticated",
    epoch: 3,
  };
  const ports = {
    session: () => session,
    refresh: vi.fn(async (_signal: AbortSignal) => user),
    signOut: vi.fn(async () => {}),
    restore: vi.fn(async () => {}),
    navigate: vi.fn(),
    changed: vi.fn(),
  };
  const run = new ProfileHomeRun(session, ports);
  run.activate();
  return {
    run,
    ports,
    change: (patch: Partial<HomeSession>) => {
      session = { ...session, ...patch };
    },
  };
}

describe("personal home profile, intent and navigation ownership", () => {
  it.each([
    ["edit", "account:profile:update"],
    ["favorites", "member:favorite:toggle"],
    ["dynamics", "community:dynamic:read-own"],
    ["ai", "ai:conversation:use"],
  ] as const)(
    "uses the %s grant rather than a hardcoded business role",
    (target, grant) => {
      const frame: HomeSession = {
        user: { ...user, permissionKeys: [] },
        status: "authenticated",
        epoch: 3,
      };
      expect(homeTargetAllowed(target, frame)).toBe(false);
      frame.user = { ...user, roles: [], permissionKeys: [grant] };
      expect(homeTargetAllowed(target, frame)).toBe(true);
      expect(homeTargetAllowed("settings", frame)).toBe(true);
    },
  );
  it("exposes login only for a guest and does not fetch a guest's private profile", async () => {
    const { run, ports } = setup(true);
    await run.refresh();
    expect(ports.refresh).not.toHaveBeenCalled();
    expect(run.navigate("ai")).toBe(false);
    expect(run.navigate("auth")).toBe(true);
    expect(ports.navigate).toHaveBeenCalledExactlyOnceWith("/auth");
  });
  it("reads the server even when cached profile-read permission is missing", async () => {
    const { run, ports, change } = setup();
    change({ user: { ...user, permissionKeys: [] } });
    await run.refresh();
    expect(ports.refresh).toHaveBeenCalledOnce();
    expect(run.snapshot().profileDenied).toBe(false);
  });
  it.each([
    { epoch: 4 },
    { user: { ...user, userId: 8, account: "other" } },
    { user: null, status: "anonymous" as const },
  ])(
    "rejects an older render's logout and navigation on boundary %#",
    async (patch) => {
      const { run, ports, change } = setup();
      change(patch);
      await run.signOut();
      await run.refresh();
      expect(run.navigate("favorites")).toBe(false);
      expect(ports.signOut).not.toHaveBeenCalled();
      expect(ports.refresh).not.toHaveBeenCalled();
      expect(ports.navigate).not.toHaveBeenCalled();
    },
  );
  it("checks a grant again when an already rendered entry is pressed", () => {
    const { run, ports, change } = setup();
    change({ user: { ...user, permissionKeys: [] } });
    expect(run.navigate("favorites")).toBe(false);
    expect(ports.navigate).not.toHaveBeenCalled();
    expect(run.navigate("settings")).toBe(true);
  });
  it("gates repeated navigation synchronously until the next focus", () => {
    const { run, ports } = setup();
    expect(run.navigate("ai")).toBe(true);
    expect(run.navigate("favorites")).toBe(false);
    expect(ports.navigate).toHaveBeenCalledOnce();
    run.deactivate();
    run.activate();
    expect(run.navigate("favorites")).toBe(true);
  });
  it("cancels its own profile read before navigation", async () => {
    const { run, ports } = setup();
    const remote = deferred<typeof user>();
    ports.refresh.mockReturnValue(remote.promise);
    const read = run.refresh();
    const signal = ports.refresh.mock.calls[0]![0];
    expect(run.navigate("settings")).toBe(true);
    expect(signal.aborted).toBe(true);
    remote.resolve(user);
    await read;
    expect(run.snapshot().refreshing).toBe(false);
  });
  it("cancels a profile read on blur and does not publish its late result after refocus", async () => {
    const { run, ports } = setup();
    const old = deferred<typeof user>();
    const fresh = deferred<typeof user>();
    ports.refresh
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const first = run.refresh();
    const signal = ports.refresh.mock.calls[0]![0];
    run.deactivate();
    run.activate();
    const second = run.refresh();
    expect(signal.aborted).toBe(true);
    old.reject(new Error("private old failure"));
    await first;
    expect(run.snapshot()).toMatchObject({ refreshing: true, notice: null });
    fresh.resolve(user);
    await second;
    expect(run.snapshot()).toMatchObject({
      refreshing: false,
      profileDenied: false,
      notice: null,
    });
  });
  it("hides unreadable profile details and allows independent grants/settings after refresh fails", async () => {
    const { run, ports } = setup();
    ports.refresh.mockRejectedValue(new Error("private server detail"));
    await run.refresh();
    expect(run.snapshot()).toMatchObject({
      refreshing: false,
      profileDenied: true,
      notice: "资料更新失败，请重试。",
    });
    expect(run.navigate("ai")).toBe(true);
    expect(JSON.stringify(run.snapshot())).not.toContain(
      "private server detail",
    );
  });
  it("refuses profile data from a mismatched account", async () => {
    const { run, ports } = setup();
    ports.refresh.mockResolvedValue({ ...user, account: "other" });
    await run.refresh();
    expect(run.snapshot().profileDenied).toBe(true);
  });
  it("does not start duplicate profile reads", async () => {
    const { run, ports } = setup();
    const remote = deferred<typeof user>();
    ports.refresh.mockReturnValue(remote.promise);
    const read = run.refresh();
    await run.refresh();
    expect(ports.refresh).toHaveBeenCalledOnce();
    remote.resolve(user);
    await read;
  });
  it("lets logout cancel the read and keeps its own busy flag until logout settles", async () => {
    const { run, ports } = setup();
    const remote = deferred<typeof user>();
    const logout = deferred<void>();
    ports.refresh.mockReturnValue(remote.promise);
    ports.signOut.mockReturnValue(logout.promise);
    const read = run.refresh();
    const exit = run.signOut();
    expect(ports.refresh.mock.calls[0]![0].aborted).toBe(true);
    await run.signOut();
    expect(run.navigate("ai")).toBe(false);
    expect(ports.signOut).toHaveBeenCalledOnce();
    remote.resolve(user);
    await read;
    expect(run.snapshot().loggingOut).toBe(true);
    logout.resolve();
    await exit;
    expect(run.snapshot().loggingOut).toBe(false);
  });
  it("does not publish an old logout failure after a new session begins", async () => {
    const { run, ports, change } = setup();
    const logout = deferred<void>();
    ports.signOut.mockReturnValue(logout.promise);
    const exit = run.signOut();
    change({ epoch: 4 });
    ports.changed.mockClear();
    logout.reject(new Error("old signout failed"));
    await exit;
    expect(ports.changed).not.toHaveBeenCalled();
  });
  it("does not publish a previous focus's logout warning after refocus", async () => {
    const { run, ports } = setup();
    const logout = deferred<void>();
    ports.signOut.mockReturnValue(logout.promise);
    const exit = run.signOut();
    run.deactivate();
    run.activate();
    logout.reject(new Error("old failure"));
    await exit;
    expect(run.snapshot()).toMatchObject({ loggingOut: false, notice: null });
  });
  it("preserves a truthful warning for a current logout failure without retry", async () => {
    const { run, ports } = setup();
    ports.signOut.mockRejectedValue(new Error("failed"));
    await run.signOut();
    expect(ports.signOut).toHaveBeenCalledOnce();
    expect(run.snapshot().notice).toContain("尚未确认");
  });
  it("single-flights guest restore retries and blocks competing login navigation", async () => {
    const { run, ports } = setup(true);
    const restore = deferred<void>();
    ports.restore.mockReturnValue(restore.promise);
    const first = run.retryRestore();
    await run.retryRestore();
    expect(run.navigate("auth")).toBe(false);
    expect(ports.restore).toHaveBeenCalledOnce();
    restore.resolve();
    await first;
    expect(run.snapshot().recovering).toBe(false);
  });
  it("ignores a guest restore failure belonging to an earlier focus", async () => {
    const { run, ports } = setup(true);
    const restore = deferred<void>();
    ports.restore.mockReturnValue(restore.promise);
    const first = run.retryRestore();
    run.deactivate();
    run.activate();
    restore.reject(new Error("old"));
    await first;
    expect(run.snapshot()).toMatchObject({ recovering: false, notice: null });
  });
});
