import { describe, expect, it, vi } from "vitest";
import { AiListRecovery, aiListRecoveryFor } from "./list-recovery";
import { AiConversationListRun } from "./conversation-list-run";
import { ApiError } from "../../platform/api/api-error";

vi.mock("../../platform/api/api-client", () => ({
  apiRequest: vi.fn(),
  apiStreamRequest: vi.fn(),
}));
const id = "e9b35d28-193f-46f6-bdf4-dd6c9194ad25";
const item = {
  conversationId: id,
  title: null,
  status: "active" as const,
  createdAt: "2026-11-03T00:00:00Z",
  updatedAt: "2026-11-03T00:00:00Z",
  messageCount: 0,
};
const page = { items: [item], page: 1, pageSize: 20, total: 1 };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(recovery = new AiListRecovery()) {
  const ports = {
    verify: vi.fn(async (_signal: AbortSignal) => {}),
    list: vi.fn(async (_page: number, _signal: AbortSignal) => page),
    create: vi.fn(async (_signal: AbortSignal) => item),
    remove: vi.fn(async (_id: string, _signal: AbortSignal) => {}),
    created: vi.fn(),
    removed: vi.fn(),
    changed: vi.fn(),
  };
  const run = new AiConversationListRun(ports, recovery);
  run.activate();
  const load = () => run.loadPage(1, new AbortController().signal);
  return { run, ports, load };
}
describe("AI list recovery across complete page replacement", () => {
  it.each(["create", "delete"] as const)(
    "retains unknown %s after unmount and requires explicit reviewed acknowledgment",
    async (kind) => {
      const recovery = new AiListRecovery(),
        old = fixture(recovery);
      await old.load();
      if (kind === "create")
        old.ports.create.mockRejectedValueOnce(new Error("response lost"));
      else old.ports.remove.mockRejectedValueOnce(new Error("response lost"));
      await (kind === "create" ? old.run.create() : old.run.remove(id));
      old.run.dispose();
      const next = fixture(recovery);
      expect(next.run.snapshot()).toMatchObject({
        uncertain: true,
        reviewed: false,
        ready: false,
      });
      expect(await next.run.create()).toBe(false);
      next.run.acknowledgeReview();
      expect(await next.run.remove(id)).toBe(false);
      await next.load();
      expect(next.run.snapshot().reviewed).toBe(true);
      expect(await next.run.create()).toBe(false);
      next.run.acknowledgeReview();
      expect(next.run.snapshot().uncertain).toBe(false);
      expect(await next.run.create()).toBe(true);
      expect(next.ports.create).toHaveBeenCalledOnce();
      expect(next.ports.remove).not.toHaveBeenCalled();
      next.run.dispose();
    },
  );
  it.each(["success", "failure"] as const)(
    "keeps detached tasks locked until late %s settles without publishing old callbacks",
    async (outcome) => {
      const recovery = new AiListRecovery(),
        old = fixture(recovery),
        gate = deferred<typeof item>();
      await old.load();
      old.ports.create.mockReturnValueOnce(gate.promise);
      const pending = old.run.create();
      await vi.waitFor(() => expect(old.ports.create).toHaveBeenCalledOnce());
      old.run.dispose();
      const changes = old.ports.changed.mock.calls.length,
        next = fixture(recovery);
      await next.load();
      expect(next.run.snapshot()).toMatchObject({
        busy: "create",
        uncertain: true,
        reviewed: false,
      });
      next.run.acknowledgeReview();
      expect(await next.run.create()).toBe(false);
      expect(await next.run.remove(id)).toBe(false);
      if (outcome === "success") gate.resolve(item);
      else gate.reject(new Error("late"));
      expect(await pending).toBe(false);
      expect(old.ports.created).not.toHaveBeenCalled();
      expect(old.ports.changed.mock.calls.length).toBe(changes);
      expect(next.run.snapshot()).toMatchObject({
        busy: null,
        uncertain: true,
        reviewed: false,
      });
      next.run.acknowledgeReview();
      expect(next.run.snapshot().uncertain).toBe(true);
      await next.load();
      next.run.acknowledgeReview();
      expect(next.run.snapshot().uncertain).toBe(false);
      next.run.dispose();
    },
  );
  it("arbitrates competing screens before identity verification and synchronizes busy state", async () => {
    const recovery = new AiListRecovery(),
      a = fixture(recovery),
      b = fixture(recovery),
      auth = deferred<void>();
    await a.load();
    await b.load();
    a.ports.verify.mockReturnValueOnce(auth.promise);
    const first = a.run.create();
    expect(b.run.snapshot().busy).toBe("create");
    expect(await b.run.remove(id)).toBe(false);
    expect(b.ports.verify).toHaveBeenCalledOnce();
    auth.resolve();
    await first;
    expect(b.run.snapshot().busy).toBeNull();
    expect(await b.run.remove(id)).toBe(true);
    a.run.dispose();
    b.run.dispose();
  });
  it("releases a detached preflight immediately because it can no longer send", async () => {
    const recovery = new AiListRecovery(),
      old = fixture(recovery),
      auth = deferred<void>();
    await old.load();
    old.ports.verify.mockReturnValueOnce(auth.promise);
    const pending = old.run.create();
    old.run.dispose();
    const next = fixture(recovery);
    await next.load();
    const response = deferred<typeof item>();
    next.ports.create.mockReturnValueOnce(response.promise);
    const newer = next.run.create();
    await vi.waitFor(() => expect(next.ports.create).toHaveBeenCalledOnce());
    auth.resolve();
    await pending;
    expect(old.ports.create).not.toHaveBeenCalled();
    expect(next.run.snapshot().busy).toBe("create");
    response.resolve(item);
    await newer;
    next.run.dispose();
  });
  it("invalidates an earlier review across screens when another operation begins", async () => {
    const recovery = new AiListRecovery(),
      a = fixture(recovery),
      b = fixture(recovery);
    await a.load();
    await b.load();
    a.ports.create.mockRejectedValueOnce(new Error("unknown"));
    await a.run.create();
    await a.load();
    await b.load();
    a.run.acknowledgeReview();
    expect(b.run.snapshot()).toMatchObject({
      uncertain: false,
      reviewed: false,
      error: null,
    });
    b.ports.remove.mockRejectedValueOnce(new Error("unknown again"));
    await b.run.remove(id);
    a.run.acknowledgeReview();
    expect(a.run.snapshot()).toMatchObject({
      uncertain: true,
      reviewed: false,
    });
    a.run.dispose();
    b.run.dispose();
  });
  it("does not accept a read that overlapped settlement of a detached task", async () => {
    const recovery = new AiListRecovery(),
      old = fixture(recovery),
      task = deferred<typeof item>();
    await old.load();
    old.ports.create.mockReturnValueOnce(task.promise);
    const pending = old.run.create();
    await vi.waitFor(() => expect(old.ports.create).toHaveBeenCalledOnce());
    old.run.dispose();
    const next = fixture(recovery),
      read = deferred<typeof page>();
    next.ports.list.mockReturnValueOnce(read.promise);
    const loading = next.load();
    await vi.waitFor(() => expect(next.ports.list).toHaveBeenCalledOnce());
    task.resolve(item);
    await pending;
    read.resolve(page);
    await loading;
    expect(next.run.snapshot().reviewed).toBe(false);
    next.run.acknowledgeReview();
    expect(next.run.snapshot().uncertain).toBe(true);
    await next.load();
    expect(next.run.snapshot().reviewed).toBe(true);
    next.run.dispose();
  });
  it.each([401, 403])(
    "cannot acknowledge after authorization fails with %s",
    async (status) => {
      const recovery = new AiListRecovery(),
        a = fixture(recovery);
      await a.load();
      a.ports.create.mockRejectedValueOnce(new Error("lost"));
      await a.run.create();
      await a.load();
      a.ports.verify.mockRejectedValueOnce(
        new ApiError("denied", { status, code: null, traceId: null }),
      );
      await expect(a.load()).rejects.toMatchObject({ status });
      a.run.acknowledgeReview();
      expect(a.run.snapshot()).toMatchObject({
        uncertain: true,
        ready: false,
        reviewed: false,
      });
      // Another listener notification must not restore a stale successful review.
      a.run.dispose();
      const next = fixture(recovery);
      expect(next.run.snapshot().reviewed).toBe(false);
      next.run.dispose();
    },
  );
  it("isolates accounts and runtimes, and retains same-account re-entry state", async () => {
    const runtime = {},
      recovery = aiListRecoveryFor(runtime, 7),
      a = fixture(recovery);
    await a.load();
    a.ports.create.mockRejectedValueOnce(new Error("lost"));
    await a.run.create();
    a.run.dispose();
    expect(aiListRecoveryFor(runtime, 7)).toBe(recovery);
    expect(aiListRecoveryFor(runtime, 8).snapshot().uncertain).toBe(false);
    expect(aiListRecoveryFor({}, 7).snapshot().uncertain).toBe(false);
    const returned = fixture(aiListRecoveryFor(runtime, 7));
    expect(returned.run.snapshot().uncertain).toBe(true);
    returned.run.dispose();
  });
  it("does not restore review permission from an older successful read after a newer denied read", async () => {
    const a = fixture();
    await a.load();
    a.ports.create.mockRejectedValueOnce(new Error("lost"));
    await a.run.create();
    const old = deferred<typeof page>();
    a.ports.list.mockReturnValueOnce(old.promise);
    const first = a.load();
    const rejection = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(a.ports.list).toHaveBeenCalledTimes(2));
    a.ports.verify.mockRejectedValueOnce(
      new ApiError("denied", { status: 403, code: null, traceId: null }),
    );
    await expect(a.load()).rejects.toMatchObject({ status: 403 });
    old.resolve(page);
    await rejection;
    a.run.acknowledgeReview();
    expect(a.run.snapshot()).toMatchObject({
      ready: false,
      reviewed: false,
      uncertain: true,
    });
    a.run.dispose();
  });
  it("does not let an older failed read erase the newest successful review", async () => {
    const a = fixture();
    await a.load();
    a.ports.create.mockRejectedValueOnce(new Error("lost"));
    await a.run.create();
    const old = deferred<typeof page>();
    a.ports.list.mockReturnValueOnce(old.promise);
    const first = a.load(),
      rejection = expect(first).rejects.toThrow("old read");
    await vi.waitFor(() => expect(a.ports.list).toHaveBeenCalledTimes(2));
    await a.load();
    old.reject(new Error("old read"));
    await rejection;
    expect(a.run.snapshot()).toMatchObject({
      ready: true,
      reviewed: true,
      uncertain: true,
    });
    a.run.acknowledgeReview();
    expect(a.run.snapshot().uncertain).toBe(false);
    a.run.dispose();
  });
  it.each([0, -1, 1.5, NaN, Infinity, 2147483648])(
    "rejects invalid account %s",
    (value) => {
      expect(() => aiListRecoveryFor({}, value)).toThrow("恢复上下文无效");
    },
  );
  it("guards stale owners and bad observers without releasing another task", () => {
    const recovery = new AiListRecovery();
    recovery.subscribe(() => {
      throw new Error("observer");
    });
    const first = recovery.begin("create")!;
    first.finish();
    const next = recovery.begin("delete")!;
    first.finish();
    first.unknown();
    expect(recovery.snapshot()).toMatchObject({
      busy: "delete",
      uncertain: false,
    });
    next.unknown();
    expect(recovery.acknowledge(recovery.snapshot().revision)).toBe(false);
    next.finish();
    const revision = recovery.snapshot().revision;
    expect(recovery.acknowledge(revision - 1)).toBe(false);
    expect(recovery.acknowledge(revision)).toBe(true);
  });
});
