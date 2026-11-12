vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => 0,
  assertSessionEpoch: vi.fn(),
}));
import { describe, expect, it, vi } from "vitest";
import { FavoriteRun } from "./favorite-run";
import { ApiError } from "../../platform/api/api-error";
import type { FavoriteTarget } from "./favorites-api";
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
const target: FavoriteTarget = { targetType: "resort", targetId: 12 };
const failure = (status: number) =>
  new ApiError("failed", { status, code: null, traceId: null });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function setup(previous = false, actual = true) {
  const ports = {
    prepare: vi.fn(async (_signal: AbortSignal): Promise<void> => undefined),
    verify: vi.fn(async (_signal: AbortSignal): Promise<void> => undefined),
    read: vi
      .fn(
        async (
          _target: FavoriteTarget,
          _signal: AbortSignal,
        ): Promise<boolean> => actual,
      )
      .mockResolvedValueOnce(previous),
    write: vi.fn(
      async (
        _target: FavoriteTarget,
        _desired: boolean,
        _signal: AbortSignal,
      ): Promise<void> => undefined,
    ),
    reconciled: vi.fn(),
    changed: vi.fn(),
  };
  const run = new FavoriteRun(ports);
  run.activate();
  return { run, ports };
}
describe("explicit favorite state and focused account lifecycle", () => {
  it("submits desired state once then publishes only reread actual state", async () => {
    const { run, ports } = setup();
    expect(await run.set(target, true)).toBe(true);
    expect(ports.write).toHaveBeenCalledExactlyOnceWith(
      target,
      true,
      expect.any(AbortSignal),
    );
    expect(ports.read).toHaveBeenCalledTimes(2);
    expect(ports.verify).toHaveBeenCalledTimes(3);
    expect(ports.reconciled).toHaveBeenCalledExactlyOnceWith(target, true);
    expect(run.snapshot()).toMatchObject({
      busy: false,
      pending: null,
      needsReview: false,
    });
  });
  it("does not invert a newer state already equal to the requested value", async () => {
    const { run, ports } = setup(true);
    expect(await run.set(target, true)).toBe(true);
    expect(ports.write).not.toHaveBeenCalled();
    expect(ports.reconciled).toHaveBeenCalledExactlyOnceWith(target, true);
  });
  it("stops before writing if identity or permission changes during the state read", async () => {
    const { run, ports } = setup();
    ports.verify
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure(403));
    expect(await run.set(target, true)).toBe(false);
    expect(ports.write).not.toHaveBeenCalled();
    expect(ports.reconciled).not.toHaveBeenCalled();
    expect(run.snapshot().needsReview).toBe(false);
  });
  it("keeps an attempted write unresolved if identity changes before publishing its reread", async () => {
    const { run, ports } = setup();
    ports.verify
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure(403));
    expect(await run.set(target, true)).toBe(false);
    expect(ports.write).toHaveBeenCalledOnce();
    expect(ports.reconciled).not.toHaveBeenCalled();
    expect(run.snapshot().needsReview).toBe(true);
  });
  it("locks before asynchronous preparation so repeated or different rows cannot overlap", async () => {
    const { run, ports } = setup();
    const pending = deferred<void>();
    ports.prepare.mockImplementationOnce(() => pending.promise);
    const first = run.set(target, true);
    expect(await run.set({ targetType: "article", targetId: 13 }, false)).toBe(
      false,
    );
    expect(run.snapshot().busy).toBe(true);
    pending.resolve();
    expect(await first).toBe(true);
    expect(ports.write).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 404, 409, 422])(
    "does not replay or reconcile a definitive write rejection %s",
    async (status) => {
      const { run, ports } = setup();
      ports.write.mockRejectedValueOnce(failure(status));
      expect(await run.set(target, true)).toBe(false);
      expect(ports.write).toHaveBeenCalledOnce();
      expect(ports.read).toHaveBeenCalledOnce();
      expect(run.snapshot().needsReview).toBe(false);
      expect(ports.reconciled).not.toHaveBeenCalled();
    },
  );
  it.each([0, 408, 500, 503])(
    "reconciles a possibly committed %s without replay",
    async (status) => {
      const { run, ports } = setup();
      ports.write.mockRejectedValueOnce(failure(status));
      expect(await run.set(target, true)).toBe(true);
      expect(ports.write).toHaveBeenCalledOnce();
      expect(ports.reconciled).toHaveBeenCalledWith(target, true);
      expect(run.snapshot().notice).toContain("重新核对");
      expect(run.snapshot().needsReview).toBe(false);
    },
  );
  it.each([403, 404, 500])(
    "keeps uncertainty when a lost response is followed by read %s",
    async (status) => {
      const { run, ports } = setup();
      ports.write.mockRejectedValueOnce(new Error("lost response"));
      ports.read.mockRejectedValueOnce(failure(status));
      expect(await run.set(target, true)).toBe(false);
      expect(run.snapshot()).toMatchObject({
        needsReview: true,
        pending: target,
        busy: false,
      });
      expect(await run.set(target, false)).toBe(false);
      ports.read.mockRejectedValueOnce(failure(404));
      expect(await run.review()).toBe(false);
      expect(run.snapshot().needsReview).toBe(true);
      expect(ports.write).toHaveBeenCalledTimes(1);
      expect(await run.review()).toBe(true);
      expect(ports.reconciled).toHaveBeenCalledWith(target, true);
      expect(run.snapshot().needsReview).toBe(false);
      expect(ports.write).toHaveBeenCalledTimes(1);
    },
  );
  it("distinguishes acknowledged write with failed state read from unknown write", async () => {
    const { run, ports } = setup();
    ports.read.mockRejectedValueOnce(failure(404));
    expect(await run.set(target, true)).toBe(false);
    expect(run.snapshot().notice).toContain("服务端已确认");
    expect(run.snapshot().needsReview).toBe(true);
    expect(ports.reconciled).not.toHaveBeenCalled();
  });
  it("reports a newer conflicting actual state without reissuing desired write", async () => {
    const { run, ports } = setup(false, false);
    expect(await run.set(target, true)).toBe(true);
    expect(ports.reconciled).toHaveBeenCalledWith(target, false);
    expect(run.snapshot().notice).toContain("其他操作");
    expect(ports.write).toHaveBeenCalledOnce();
  });
  it.each(["prepare", "verify", "read", "write", "reconcile"])(
    "blur during %s prevents late callbacks and subsequent writes",
    async (stage) => {
      const { run, ports } = setup();
      const pending = deferred<void>();
      if (stage === "prepare")
        ports.prepare.mockImplementationOnce(() => pending.promise);
      if (stage === "verify")
        ports.verify.mockImplementationOnce(() => pending.promise);
      if (stage === "read")
        ports.read.mockReset().mockImplementationOnce(async () => {
          await pending.promise;
          return false;
        });
      if (stage === "write")
        ports.write.mockImplementationOnce(() => pending.promise);
      if (stage === "reconcile")
        ports.read
          .mockReset()
          .mockResolvedValueOnce(false)
          .mockImplementationOnce(async () => {
            await pending.promise;
            return true;
          });
      const task = run.set(target, true);
      await vi.waitFor(() => {
        const calls =
          stage === "prepare"
            ? ports.prepare
            : stage === "verify"
              ? ports.verify
              : stage === "write"
                ? ports.write
                : ports.read;
        expect(calls).toHaveBeenCalledTimes(stage === "reconcile" ? 2 : 1);
      });
      const published = ports.changed.mock.calls.length;
      run.dispose();
      pending.resolve();
      expect(await task).toBe(false);
      expect(ports.reconciled).not.toHaveBeenCalled();
      expect(ports.changed).toHaveBeenCalledTimes(published);
      expect(ports.write).toHaveBeenCalledTimes(
        ["write", "reconcile"].includes(stage) ? 1 : 0,
      );
      expect(run.snapshot().needsReview).toBe(
        ["write", "reconcile"].includes(stage),
      );
    },
  );
  it("refocus cannot be completed by an older write response", async () => {
    const { run, ports } = setup();
    const pending = deferred<void>();
    ports.write.mockImplementationOnce(() => pending.promise);
    const first = run.set(target, true);
    await vi.waitFor(() => expect(ports.write).toHaveBeenCalledOnce());
    run.dispose();
    run.activate();
    expect(await run.review()).toBe(false);
    pending.resolve();
    expect(await first).toBe(false);
    expect(await run.review()).toBe(true);
    expect(ports.reconciled).toHaveBeenCalledTimes(1);
    expect(run.snapshot()).toMatchObject({ needsReview: false, busy: false });
  });
  it("snapshots input so UI mutation cannot retarget an in-flight action", async () => {
    const { run, ports } = setup();
    const input = { ...target };
    const task = run.set(input, true);
    input.targetId = 99;
    await task;
    expect(ports.write).toHaveBeenCalledWith(
      target,
      true,
      expect.any(AbortSignal),
    );
  });
  it("does not publish content from reads superseded by a mutation", async () => {
    const { run } = setup();
    const pending = deferred<string>();
    const fetch = vi.fn(() => pending.promise);
    const read = run.read(new AbortController().signal, fetch);
    const rejected = expect(read).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await run.set(target, true);
    pending.resolve("OLD-PRIVATE-CONTENT");
    await rejected;
  });
  it("checks account both before and after private list reads", async () => {
    const { run, ports } = setup();
    const fetch = vi.fn(async () => "private");
    expect(await run.read(new AbortController().signal, fetch)).toBe("private");
    expect(ports.verify).toHaveBeenCalledTimes(2);
    ports.verify
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure(403));
    await expect(
      run.read(new AbortController().signal, fetch),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("aborts retained-screen reads even when transport returns late", async () => {
    const { run } = setup();
    const pending = deferred<string>();
    const fetch = vi.fn(() => pending.promise);
    const read = run.read(new AbortController().signal, fetch);
    const rejected = expect(read).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    run.dispose();
    pending.resolve("PRIVATE");
    await rejected;
  });
});
