import { describe, expect, it, vi } from "vitest";
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => 0,
  assertSessionEpoch: vi.fn(),
}));
import {
  FavoriteRecoveryLedger,
  favoriteLedgerForAccount,
} from "./favorite-recovery";
import { FavoriteRun } from "./favorite-run";
import { ApiError } from "../../platform/api/api-error";
import type { FavoriteTarget } from "./favorites-api";
const target: FavoriteTarget = { targetType: "resort", targetId: 12 };
const article: FavoriteTarget = { targetType: "article", targetId: 13 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(ledger: FavoriteRecoveryLedger) {
  const ports = {
    prepare: vi.fn(async () => {}),
    verify: vi.fn(async () => {}),
    read: vi.fn(async () => false),
    write: vi.fn(async () => {}),
    reconciled: vi.fn(),
    changed: vi.fn(),
  };
  const run = new FavoriteRun(ports, ledger);
  run.activate();
  return { ports, run };
}
describe("favorite runtime recovery across screens", () => {
  it("clears the other screen's recovery notice after a successful review", async () => {
    const ledger = new FavoriteRecoveryLedger(),
      lease = ledger.begin(target, false)!;
    lease.attempted();
    lease.finish(false);
    const a = setup(ledger),
      b = setup(ledger);
    expect(b.run.snapshot().notice).toContain("尚未确认");
    expect(await a.run.review()).toBe(true);
    expect(b.run.snapshot()).toMatchObject({
      busy: false,
      pending: null,
      needsReview: false,
      notice: null,
    });
  });
  it.each([target, article])(
    "serializes two instances before asynchronous prepare for %j",
    async (second) => {
      const ledger = new FavoriteRecoveryLedger(),
        a = setup(ledger),
        b = setup(ledger),
        wait = deferred<void>();
      a.ports.prepare.mockImplementationOnce(() => wait.promise);
      const saving = a.run.set(target, true);
      expect(b.run.snapshot().busy).toBe(true);
      expect(await b.run.set(second, true)).toBe(false);
      expect(b.ports.prepare).not.toHaveBeenCalled();
      wait.resolve();
      await saving;
      expect(b.run.snapshot().busy).toBe(false);
      expect(await b.run.set(second, true)).toBe(true);
    },
  );
  it("new screen cannot review or write while a detached request is still settling", async () => {
    const ledger = new FavoriteRecoveryLedger(),
      a = setup(ledger),
      wait = deferred<void>();
    a.ports.write.mockImplementationOnce(() => wait.promise);
    const saving = a.run.set(target, true);
    await vi.waitFor(() => expect(a.ports.write).toHaveBeenCalledOnce());
    a.run.dispose();
    const b = setup(ledger);
    expect(b.run.snapshot()).toMatchObject({
      busy: true,
      needsReview: true,
      pending: target,
    });
    expect(await b.run.review()).toBe(false);
    expect(await b.run.set(article, true)).toBe(false);
    expect(b.ports.read).not.toHaveBeenCalled();
    wait.resolve();
    expect(await saving).toBe(false);
    expect(b.run.snapshot()).toMatchObject({
      busy: false,
      needsReview: true,
      pending: target,
    });
    expect(a.ports.reconciled).not.toHaveBeenCalled();
    b.ports.read.mockResolvedValue(true);
    expect(await b.run.review()).toBe(true);
    expect(b.ports.read).toHaveBeenCalledExactlyOnceWith(
      target,
      expect.any(AbortSignal),
    );
    expect(b.ports.write).not.toHaveBeenCalled();
    expect(b.run.snapshot().needsReview).toBe(false);
  });
  it("unknown response survives complete run replacement without replaying desired state", async () => {
    const ledger = new FavoriteRecoveryLedger(),
      a = setup(ledger);
    a.ports.write.mockRejectedValueOnce(new TypeError("response lost"));
    a.ports.read
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("offline"));
    expect(await a.run.set(target, true)).toBe(false);
    a.run.dispose();
    const b = setup(ledger);
    expect(b.run.snapshot()).toMatchObject({
      needsReview: true,
      pending: target,
      busy: false,
    });
    expect(await b.run.set(article, true)).toBe(false);
    expect(await b.run.review()).toBe(true);
    expect(b.ports.write).not.toHaveBeenCalled();
    expect(b.ports.reconciled).toHaveBeenCalledWith(target, false);
    expect(await b.run.set(article, true)).toBe(true);
  });
  it("confirmed write with failed state read retains confirmation for the next screen", async () => {
    const ledger = new FavoriteRecoveryLedger(),
      a = setup(ledger);
    a.ports.read
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("offline"));
    await a.run.set(target, true);
    a.run.dispose();
    const b = setup(ledger);
    expect(b.run.snapshot().notice).toContain("已确认");
    expect(b.run.snapshot().needsReview).toBe(true);
  });
  it.each([401, 403, 404, 409, 422])(
    "definitive %s does not block a different screen",
    async (status) => {
      const ledger = new FavoriteRecoveryLedger(),
        a = setup(ledger),
        b = setup(ledger);
      a.ports.write.mockRejectedValueOnce(
        new ApiError("rejected", { status, code: null, traceId: null }),
      );
      await a.run.set(target, true);
      expect(b.run.snapshot()).toMatchObject({
        needsReview: false,
        busy: false,
        pending: null,
      });
      expect(await b.run.set(article, true)).toBe(true);
    },
  );
  it("preflight cancellation releases the runtime lease without inventing an unknown write", async () => {
    const ledger = new FavoriteRecoveryLedger(),
      a = setup(ledger),
      wait = deferred<void>();
    a.ports.verify.mockImplementationOnce(() => wait.promise);
    const saving = a.run.set(target, true);
    await vi.waitFor(() => expect(a.ports.verify).toHaveBeenCalledOnce());
    a.run.dispose();
    const b = setup(ledger);
    expect(b.run.snapshot().busy).toBe(true);
    wait.resolve();
    await saving;
    expect(b.run.snapshot()).toMatchObject({ busy: false, needsReview: false });
    expect(a.ports.write).not.toHaveBeenCalled();
    expect(await b.run.set(article, true)).toBe(true);
  });
  it("failed review preserves the original target and serializes a second reviewer", async () => {
    const ledger = new FavoriteRecoveryLedger(),
      lease = ledger.begin(target, false)!;
    lease.attempted();
    lease.finish(false);
    const a = setup(ledger),
      b = setup(ledger),
      wait = deferred<boolean>();
    a.ports.read.mockImplementationOnce(() => wait.promise);
    const reviewing = a.run.review();
    await vi.waitFor(() => expect(a.ports.read).toHaveBeenCalledOnce());
    expect(await b.run.review()).toBe(false);
    a.run.dispose();
    wait.reject(new Error("late network failure"));
    await reviewing;
    expect(b.run.snapshot()).toMatchObject({
      busy: false,
      needsReview: true,
      pending: target,
    });
    expect(await b.run.review()).toBe(true);
    expect(b.ports.write).not.toHaveBeenCalled();
  });
  it("shared mutation supersedes an earlier read in another run", async () => {
    const ledger = new FavoriteRecoveryLedger(),
      a = setup(ledger),
      b = setup(ledger),
      wait = deferred<string>(),
      fetch = vi.fn(() => wait.promise);
    const reading = a.run.read(new AbortController().signal, fetch),
      rejected = expect(reading).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await b.run.set(target, true);
    wait.resolve("stale private projection");
    await rejected;
  });
  it("same account shares unresolved state across new sessions; another account/runtime/guest stays isolated", async () => {
    const runtime = {},
      a = favoriteLedgerForAccount(runtime, 7),
      lease = a.begin(target, false)!;
    lease.attempted();
    lease.finish(false);
    expect(favoriteLedgerForAccount(runtime, 7)).toBe(a);
    for (const other of [
      favoriteLedgerForAccount(runtime, 8),
      favoriteLedgerForAccount({}, 7),
      favoriteLedgerForAccount(runtime, null),
    ])
      expect(other.snapshot()).toEqual({ busy: false, pending: null });
    const b = setup(favoriteLedgerForAccount(runtime, 8));
    expect(await b.run.set(article, true)).toBe(true);
    expect(a.snapshot().pending?.target).toEqual(target);
  });
  it("stale lease completion cannot release another instance's active write", () => {
    const ledger = new FavoriteRecoveryLedger(),
      first = ledger.begin(target, false)!;
    first.finish(true);
    const second = ledger.begin(article, false)!;
    second.attempted();
    first.finish(true);
    first.rejected();
    expect(ledger.snapshot()).toMatchObject({
      busy: true,
      pending: { target: article },
    });
    second.finish(false);
    expect(ledger.snapshot()).toMatchObject({
      busy: false,
      pending: { target: article },
    });
  });
  it("disposed subscribers never receive late lease updates", async () => {
    const ledger = new FavoriteRecoveryLedger(),
      a = setup(ledger),
      wait = deferred<void>();
    a.ports.write.mockImplementationOnce(() => wait.promise);
    const saving = a.run.set(target, true);
    await vi.waitFor(() => expect(a.ports.write).toHaveBeenCalledOnce());
    a.run.dispose();
    const count = a.ports.changed.mock.calls.length;
    wait.resolve();
    await saving;
    expect(a.ports.changed).toHaveBeenCalledTimes(count);
  });
});
