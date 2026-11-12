import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../platform/api/api-error";
import type { ProfileContext, ProfilePatch, UserProfile } from "./profile-api";
import { ProfileRun } from "./profile-run";
const expected = { userId: 1, account: "snow" };
const context: ProfileContext = {
  ...expected,
  nickname: "Snow",
  avatarUrl: "signed-old",
  canEdit: true,
  canUpload: true,
};
const result: UserProfile = {
  ...expected,
  nickname: "New",
  avatarAssetId: null,
  avatarUrl: null,
};
const error = (status: number) =>
  new ApiError("failure", { status, code: null, traceId: null });
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup() {
  const ports = {
    read: vi.fn(async (_signal: AbortSignal): Promise<ProfileContext> => ({
      ...context,
    })),
    pick: vi.fn(
      async (_signal: AbortSignal): Promise<string | null> => "picked",
    ),
    upload: vi.fn(async (_image: string, _signal: AbortSignal) => ({
      assetId: "19",
      status: "ready",
    })),
    patch: vi.fn(
      async (
        _body: ProfilePatch,
        _signal: AbortSignal,
      ): Promise<UserProfile> => ({ ...result }),
    ),
    saved: vi.fn(
      async (_profile: UserProfile, _signal: AbortSignal): Promise<void> =>
        undefined,
    ),
    changed: vi.fn(),
  };
  const run = new ProfileRun(expected, ports);
  run.activate();
  await run.reload();
  return { run, ports };
}
describe("focused profile editing", () => {
  it("loads fresh identity, trims Unicode nickname and omits unchanged avatar", async () => {
    const { run, ports } = await setup();
    run.setNickname(" 🏂New ");
    expect(await run.save()).toBe(true);
    expect(ports.read).toHaveBeenCalledTimes(3);
    expect(ports.patch).toHaveBeenCalledExactlyOnceWith(
      { nickname: "🏂New" },
      expect.any(AbortSignal),
    );
    expect(ports.saved).toHaveBeenCalledExactlyOnceWith(
      result,
      expect.any(AbortSignal),
    );
    expect(ports.upload).not.toHaveBeenCalled();
  });
  it("supports clearing existing avatar without upload permission", async () => {
    const { run, ports } = await setup();
    ports.read.mockResolvedValue({ ...context, canUpload: false });
    await run.reload();
    expect(await run.pick()).toBe(false);
    run.setAvatar("clear");
    expect(await run.save()).toBe(true);
    expect(ports.patch).toHaveBeenCalledWith(
      { nickname: "Snow", avatarAssetId: null },
      expect.any(AbortSignal),
    );
    expect(ports.upload).not.toHaveBeenCalled();
  });
  it("uploads a new avatar only after a fresh grant check and patches a ready asset", async () => {
    const { run, ports } = await setup();
    await run.pick();
    await run.save();
    expect(ports.read).toHaveBeenCalledTimes(4);
    expect(ports.upload).toHaveBeenCalledExactlyOnceWith(
      "picked",
      expect.any(AbortSignal),
    );
    expect(ports.patch).toHaveBeenCalledWith(
      { nickname: "Snow", avatarAssetId: "19" },
      expect.any(AbortSignal),
    );
  });
  it("retains a known ready asset after definite form rejection for an explicit retry", async () => {
    const { run, ports } = await setup();
    await run.pick();
    ports.patch.mockRejectedValueOnce(error(422));
    expect(await run.save()).toBe(false);
    expect(run.snapshot().needsReview).toBe(false);
    run.setNickname("Corrected");
    expect(await run.save()).toBe(true);
    expect(ports.upload).toHaveBeenCalledTimes(1);
    expect(ports.patch).toHaveBeenCalledTimes(2);
  });
  it.each(["pending_scan", "rejected", "deleted"])(
    "does not PATCH an upload with status %s",
    async (status) => {
      const { run, ports } = await setup();
      await run.pick();
      ports.upload.mockResolvedValue({ assetId: "19", status });
      expect(await run.save()).toBe(false);
      expect(ports.patch).not.toHaveBeenCalled();
    },
  );
  it.each([0, 408, 500, 503])(
    "unknown PATCH %s requires reread AND manual acknowledgement, no automatic replay",
    async (status) => {
      const { run, ports } = await setup();
      ports.patch.mockRejectedValueOnce(error(status));
      run.setNickname("New");
      expect(await run.save()).toBe(false);
      expect(run.snapshot().needsReview).toBe(true);
      run.acknowledge();
      expect(await run.save()).toBe(false);
      await run.reload();
      expect(run.snapshot()).toMatchObject({
        needsReview: true,
        reviewed: true,
        nickname: "Snow",
      });
      expect(await run.save()).toBe(false);
      expect(await run.pick()).toBe(false);
      run.setNickname("blocked");
      expect(run.snapshot().nickname).toBe("Snow");
      run.acknowledge();
      run.setNickname("New");
      expect(await run.save()).toBe(true);
      expect(ports.patch).toHaveBeenCalledTimes(2);
    },
  );
  it("unknown upload blocks retransmission and never attempts PATCH", async () => {
    const { run, ports } = await setup();
    await run.pick();
    ports.upload.mockRejectedValue(new TypeError("lost response"));
    expect(await run.save()).toBe(false);
    expect(await run.save()).toBe(false);
    expect(run.snapshot()).toMatchObject({
      needsReview: true,
      reviewed: false,
    });
    expect(ports.upload).toHaveBeenCalledTimes(1);
    expect(ports.patch).not.toHaveBeenCalled();
  });
  it.each([400, 422])(
    "definitive PATCH %s allows corrected explicit submission",
    async (status) => {
      const { run, ports } = await setup();
      ports.patch.mockRejectedValueOnce(error(status));
      await run.save();
      expect(run.snapshot().needsReview).toBe(false);
      expect(await run.save()).toBe(true);
    },
  );
  it("409 requires fresh context and explicit review", async () => {
    const { run, ports } = await setup();
    ports.patch.mockRejectedValueOnce(error(409));
    await run.save();
    expect(run.snapshot().needsReview).toBe(true);
    expect(await run.save()).toBe(false);
  });
  it.each([401, 403])(
    "permission rejection %s hides stale private data",
    async (status) => {
      const { run, ports } = await setup();
      ports.read.mockRejectedValueOnce(error(status));
      expect(await run.save()).toBe(false);
      expect(run.snapshot()).toMatchObject({ loaded: false, profile: null });
      expect(ports.patch).not.toHaveBeenCalled();
    },
  );
  it.each([{ userId: 2 }, { account: "different" }, { canEdit: false }])(
    "identity or edit grant changes block writes %#",
    async (change) => {
      const { run, ports } = await setup();
      ports.read.mockResolvedValue({ ...context, ...change });
      expect(await run.save()).toBe(false);
      expect(ports.upload).not.toHaveBeenCalled();
      expect(ports.patch).not.toHaveBeenCalled();
    },
  );
  it("checks permissions again between ready upload and PATCH", async () => {
    const { run, ports } = await setup();
    await run.pick();
    ports.read
      .mockResolvedValueOnce(context)
      .mockResolvedValueOnce({ ...context, canUpload: false });
    expect(await run.save()).toBe(false);
    expect(ports.upload).toHaveBeenCalledOnce();
    expect(ports.patch).not.toHaveBeenCalled();
  });
  it("pre-PATCH read failure is not classified as an attempted write", async () => {
    const { run, ports } = await setup();
    ports.read.mockResolvedValueOnce(context).mockRejectedValueOnce(error(500));
    expect(await run.save()).toBe(false);
    expect(run.snapshot().needsReview).toBe(false);
    expect(ports.patch).not.toHaveBeenCalled();
  });
  it("takes the synchronous gate before reading and blocks picker and reload", async () => {
    const { run, ports } = await setup(),
      read = deferred<ProfileContext>();
    ports.read.mockReturnValueOnce(read.promise);
    const first = run.save();
    expect(await run.save()).toBe(false);
    expect(await run.pick()).toBe(false);
    expect(await run.reload()).toBe(false);
    read.resolve(context);
    await first;
    expect(ports.patch).toHaveBeenCalledTimes(1);
  });
  it("blur during fresh read aborts and discards the old completion after focus returns", async () => {
    const { run, ports } = await setup(),
      read = deferred<ProfileContext>();
    ports.read.mockReturnValueOnce(read.promise);
    const first = run.save(),
      signal = ports.read.mock.calls.at(-1)![0];
    run.dispose();
    run.activate();
    const count = ports.changed.mock.calls.length;
    read.resolve(context);
    expect(await first).toBe(false);
    expect(signal.aborted).toBe(true);
    expect(ports.changed).toHaveBeenCalledTimes(count);
    expect(ports.patch).not.toHaveBeenCalled();
    expect(run.snapshot()).toMatchObject({
      profile: null,
      nickname: "",
      loaded: false,
      needsReview: false,
    });
  });
  it("blur during native picker ignores late selection", async () => {
    const { run, ports } = await setup(),
      pick = deferred<string | null>();
    ports.pick.mockReturnValueOnce(pick.promise);
    const first = run.pick();
    await vi.waitFor(() => expect(ports.pick).toHaveBeenCalledOnce());
    run.dispose();
    run.activate();
    pick.resolve("late-image");
    await first;
    expect(run.snapshot()).toMatchObject({
      avatar: { kind: "keep" },
      needsReview: false,
    });
  });
  it.each(["upload", "patch"] as const)(
    "blur during %s preserves unknown and discards late success",
    async (stage) => {
      const { run, ports } = await setup();
      const upload = deferred<{ assetId: string; status: string }>(),
        patch = deferred<UserProfile>();
      if (stage === "upload") {
        await run.pick();
        ports.upload.mockReturnValueOnce(upload.promise);
      } else ports.patch.mockReturnValueOnce(patch.promise);
      const first = run.save();
      await vi.waitFor(() => expect(ports[stage]).toHaveBeenCalledOnce());
      run.dispose();
      run.activate();
      const count = ports.changed.mock.calls.length;
      if (stage === "upload")
        upload.resolve({ assetId: "19", status: "ready" });
      else patch.resolve(result);
      expect(await first).toBe(false);
      expect(ports.changed).toHaveBeenCalledTimes(count);
      expect(ports.saved).not.toHaveBeenCalled();
      expect(run.snapshot()).toMatchObject({
        needsReview: true,
        reviewed: false,
        profile: null,
      });
    },
  );
  it("UI refresh failure cannot downgrade an acknowledged save", async () => {
    const { run, ports } = await setup();
    ports.saved.mockRejectedValueOnce(new Error("UI failed"));
    expect(await run.save()).toBe(true);
    expect(run.snapshot().needsReview).toBe(false);
    expect(run.snapshot().notice).toContain("已保存");
  });
  it("navigation disposal preserves the acknowledged return value", async () => {
    const { run, ports } = await setup();
    ports.saved.mockImplementationOnce(async () => {
      run.dispose();
    });
    expect(await run.save()).toBe(true);
    run.activate();
    expect(run.snapshot().needsReview).toBe(false);
  });
  it("rejects blank nickname before preflight and cannot mutate an inactive form", async () => {
    const { run, ports } = await setup();
    run.setNickname(" ");
    expect(await run.save()).toBe(false);
    expect(ports.read).toHaveBeenCalledTimes(1);
    run.dispose();
    run.setNickname("late");
    expect(await run.save()).toBe(false);
    expect(await run.pick()).toBe(false);
    expect(await run.reload()).toBe(false);
  });
});
