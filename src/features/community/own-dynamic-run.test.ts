import { describe, expect, it, vi } from "vitest";
import { OwnDynamicRun } from "./own-dynamic-run";
import type { OwnDynamicDetail } from "./community-api";
import { ApiError } from "../../platform/api/api-error";

function ownDetail(id = 12): OwnDynamicDetail {
  return {
    dynamicId: id,
    author: { userId: 7, nickname: "本人", avatarUrl: null },
    summary: "摘要",
    content: "待审核私有正文",
    coverUrl: null,
    imageCount: 0,
    resort: null,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    createdAt: "2026-11-02T00:00:00Z",
    updatedAt: "2026-11-02T00:00:00Z",
    status: "pending",
    imageUrls: [],
    images: [],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const failure = (status: number) =>
  new ApiError("failure", { status, code: null, traceId: null });
function setup() {
  const ports = {
    verify: vi.fn(
      async (_signal: AbortSignal, _deleting: boolean): Promise<void> =>
        undefined,
    ),
    read: vi.fn(async (_signal: AbortSignal) => ownDetail()),
    remove: vi.fn(async (_signal: AbortSignal): Promise<void> => undefined),
    removed: vi.fn(),
    changed: vi.fn(),
  };
  const run = new OwnDynamicRun(12, ports);
  run.activate();
  const load = () => run.load(new AbortController().signal);
  return { run, ports, load };
}
describe("own dynamic focused lifecycle and deletion", () => {
  it("does not delete before a current protected read", async () => {
    const { run, ports, load } = setup();
    expect(await run.remove()).toBe(false);
    await load();
    expect(run.snapshot().ready).toBe(true);
    expect(ports.verify.mock.calls.map((call) => call[1])).toEqual([
      false,
      false,
    ]);
    expect(await run.remove()).toBe(true);
    expect(ports.verify.mock.calls.map((call) => call[1])).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(ports.read).toHaveBeenCalledTimes(2);
    expect(ports.remove).toHaveBeenCalledTimes(1);
    expect(ports.removed).toHaveBeenCalledOnce();
  });
  it("acquires the lock synchronously before identity verification", async () => {
    const { run, ports, load } = setup();
    await load();
    const pending = deferred<void>();
    ports.verify.mockImplementationOnce(() => pending.promise);
    const first = run.remove();
    expect(await run.remove()).toBe(false);
    expect(run.snapshot().busy).toBe(true);
    pending.resolve();
    expect(await first).toBe(true);
    expect(ports.remove).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 404, 409, 422])(
    "requires a fresh read after definitive %s and never replays",
    async (status) => {
      const { run, ports, load } = setup();
      await load();
      ports.remove.mockRejectedValueOnce(failure(status));
      expect(await run.remove()).toBe(false);
      expect(run.snapshot()).toMatchObject({
        uncertain: false,
        ready: false,
        busy: false,
      });
      expect(await run.remove()).toBe(false);
      await load();
      expect(await run.remove()).toBe(true);
    },
  );
  it.each([0, 408, 500, 503])(
    "blocks uncertain %s until refresh and explicit review",
    async (status) => {
      const { run, ports, load } = setup();
      await load();
      ports.remove.mockRejectedValueOnce(failure(status));
      await run.remove();
      expect(run.snapshot()).toMatchObject({
        uncertain: true,
        ready: false,
        reviewed: false,
      });
      run.acknowledgeReview();
      expect(await run.remove()).toBe(false);
      await load();
      expect(run.snapshot()).toMatchObject({
        uncertain: true,
        reviewed: true,
        ready: true,
      });
      expect(await run.remove()).toBe(false);
      run.acknowledgeReview();
      expect(await run.remove()).toBe(true);
      expect(ports.remove).toHaveBeenCalledTimes(2);
    },
  );
  it("retains uncertainty when result verification returns 404", async () => {
    const { run, ports, load } = setup();
    await load();
    ports.remove.mockRejectedValueOnce(new Error("lost response"));
    await run.remove();
    ports.read.mockRejectedValueOnce(failure(404));
    await expect(load()).rejects.toMatchObject({ status: 404 });
    run.acknowledgeReview();
    expect(run.snapshot()).toMatchObject({
      uncertain: true,
      reviewed: false,
      ready: false,
    });
    expect(ports.remove).toHaveBeenCalledTimes(1);
  });
  it.each(["verify", "read", "second-verify"])(
    "stops before DELETE when %s rejects",
    async (stage) => {
      const { run, ports, load } = setup();
      await load();
      if (stage === "verify") ports.verify.mockRejectedValueOnce(failure(403));
      if (stage === "read") ports.read.mockRejectedValueOnce(failure(404));
      if (stage === "second-verify")
        ports.verify
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(failure(403));
      expect(await run.remove()).toBe(false);
      expect(ports.remove).not.toHaveBeenCalled();
      expect(run.snapshot().uncertain).toBe(false);
    },
  );
  it.each(["verify", "read", "delete"])(
    "blur during %s suppresses late writes and navigation",
    async (stage) => {
      const { run, ports, load } = setup();
      await load();
      const pending = deferred<void>();
      if (stage === "verify")
        ports.verify.mockImplementationOnce(() => pending.promise);
      if (stage === "read")
        ports.read.mockImplementationOnce(async () => {
          await pending.promise;
          return ownDetail();
        });
      if (stage === "delete")
        ports.remove.mockImplementationOnce(() => pending.promise);
      const task = run.remove();
      await vi.waitFor(() =>
        expect(
          stage === "verify"
            ? ports.verify
            : stage === "read"
              ? ports.read
              : ports.remove,
        ).toHaveBeenCalledTimes(
          stage === "verify" ? 3 : stage === "read" ? 2 : 1,
        ),
      );
      const called = ports.changed.mock.calls.length;
      run.dispose();
      pending.resolve();
      expect(await task).toBe(false);
      expect(ports.changed).toHaveBeenCalledTimes(called);
      expect(ports.removed).not.toHaveBeenCalled();
      expect(ports.remove).toHaveBeenCalledTimes(stage === "delete" ? 1 : 0);
      expect(run.snapshot().uncertain).toBe(stage === "delete");
    },
  );
  it("refocus cannot let an old DELETE settle the new lifetime", async () => {
    const { run, ports, load } = setup();
    await load();
    const pending = deferred<void>();
    ports.remove.mockImplementationOnce(() => pending.promise);
    const task = run.remove();
    await vi.waitFor(() => expect(ports.remove).toHaveBeenCalledOnce());
    run.dispose();
    run.activate();
    await load();
    pending.resolve();
    expect(await task).toBe(false);
    expect(run.snapshot()).toMatchObject({
      ready: true,
      uncertain: true,
      busy: false,
    });
    expect(ports.removed).not.toHaveBeenCalled();
  });
  it("aborts retained-screen reads and discards late private content", async () => {
    const { run, ports, load } = setup();
    const pending = deferred<OwnDynamicDetail>();
    ports.read.mockImplementationOnce(() => pending.promise);
    const task = load();
    const rejected = expect(task).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(ports.read).toHaveBeenCalledOnce());
    run.dispose();
    pending.resolve(ownDetail());
    await rejected;
    expect(run.snapshot().ready).toBe(false);
  });
  it("discards an earlier overlapping read and only publishes the latest", async () => {
    const { run, ports, load } = setup();
    const pending = deferred<OwnDynamicDetail>();
    ports.read.mockImplementationOnce(() => pending.promise);
    const first = load();
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(ports.read).toHaveBeenCalledOnce());
    await load();
    pending.resolve(ownDetail());
    await rejected;
    expect(run.snapshot().ready).toBe(true);
  });
  it("rejects a detail with a different target and a read permission revoked after response", async () => {
    const { run, ports, load } = setup();
    ports.read.mockResolvedValueOnce(ownDetail(13));
    await expect(load()).rejects.toThrow("Unexpected own dynamic");
    ports.verify
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure(403));
    await expect(load()).rejects.toMatchObject({ status: 403 });
    expect(run.snapshot().ready).toBe(false);
  });
  it("does not treat a post-commit UI failure as an unknown server write", async () => {
    const { run, ports, load } = setup();
    await load();
    ports.removed.mockImplementation(() => {
      throw new Error("route failed");
    });
    expect(await run.remove()).toBe(true);
    expect(run.snapshot()).toMatchObject({
      uncertain: false,
      ready: false,
      busy: false,
    });
    expect(run.snapshot().error).toContain("删除已完成");
    expect(await run.remove()).toBe(false);
  });
});
