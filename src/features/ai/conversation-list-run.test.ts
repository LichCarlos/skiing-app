import { describe, expect, it, vi } from "vitest";
import {
  AiConversationListRun,
  aiListErrorMessage,
  lastConversationPage,
} from "./conversation-list-run";
import { ApiError } from "../../platform/api/api-error";
import type { AiConversationPage, AiConversationSummary } from "./ai-api";

vi.mock("../../platform/api/api-client", () => ({
  apiRequest: vi.fn(),
  apiStreamRequest: vi.fn(),
}));

const id = "e9b35d28-193f-46f6-bdf4-dd6c9194ad25";
const item: AiConversationSummary = {
  conversationId: id,
  title: null,
  status: "active",
  createdAt: "2026-10-31T00:00:00Z",
  updatedAt: "2026-10-31T00:00:00Z",
  messageCount: 0,
};
const page: AiConversationPage = {
  items: [item],
  page: 1,
  pageSize: 20,
  total: 1,
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
const apiError = (status: number) =>
  new ApiError("private error", { status, code: null, traceId: null });
function setup() {
  const ports = {
    verify: vi
      .fn<(signal: AbortSignal) => Promise<void>>()
      .mockResolvedValue(undefined),
    list: vi
      .fn<(page: number, signal: AbortSignal) => Promise<AiConversationPage>>()
      .mockResolvedValue(page),
    create: vi
      .fn<(signal: AbortSignal) => Promise<AiConversationSummary>>()
      .mockResolvedValue(item),
    remove: vi
      .fn<(id: string, signal: AbortSignal) => Promise<void>>()
      .mockResolvedValue(undefined),
    created: vi.fn(),
    removed: vi.fn(),
    changed: vi.fn(),
  };
  const run = new AiConversationListRun(ports);
  return {
    run,
    ports,
    load: () => run.loadPage(1, new AbortController().signal),
  };
}
async function ready() {
  const fixture = setup();
  fixture.run.activate();
  await fixture.load();
  fixture.ports.verify.mockClear();
  return fixture;
}
describe("AI list account/focus lifetime", () => {
  it("requires an active verified list before writing", async () => {
    const { run, ports, load } = setup();
    await expect(run.create()).resolves.toBe(false);
    await expect(load()).rejects.toMatchObject({ name: "AbortError" });
    run.activate();
    await run.create();
    expect(ports.create).not.toHaveBeenCalled();
    await load();
    await run.create();
    expect(ports.create).toHaveBeenCalledOnce();
  });
  it("shares a synchronous lock across rapid create and delete before identity resolves", async () => {
    const { run, ports } = await ready();
    const auth = deferred<void>();
    ports.verify.mockReturnValue(auth.promise);
    const first = run.create();
    await run.create();
    await run.remove(id);
    expect(run.snapshot().busy).toBe("create");
    expect(ports.verify).toHaveBeenCalledOnce();
    auth.resolve();
    await first;
    expect(ports.create).toHaveBeenCalledOnce();
    expect(ports.remove).not.toHaveBeenCalled();
  });
  it("also blocks creation and repeated deletion while deletion is in flight", async () => {
    const { run, ports } = await ready();
    const response = deferred<void>();
    ports.remove.mockReturnValue(response.promise);
    const first = run.remove(id);
    await vi.waitFor(() => expect(ports.remove).toHaveBeenCalledOnce());
    await run.create();
    await run.remove(id);
    expect(ports.create).not.toHaveBeenCalled();
    response.resolve();
    await first;
    expect(ports.removed).toHaveBeenCalledExactlyOnceWith(id);
  });
  it.each([401, 403])(
    "does not send a write when fresh identity verification rejects %s",
    async (status) => {
      const { run, ports } = await ready();
      ports.verify.mockRejectedValue(apiError(status));
      await run.create();
      expect(ports.create).not.toHaveBeenCalled();
      expect(run.snapshot().uncertain).toBe(false);
      expect(run.snapshot().ready).toBe(false);
      expect(run.snapshot().error).not.toContain("private error");
    },
  );
  it("never calls a write if blur occurs while verifying identity", async () => {
    const { run, ports, load } = await ready();
    const auth = deferred<void>();
    ports.verify.mockReturnValueOnce(auth.promise);
    const pending = run.create();
    run.dispose();
    auth.resolve();
    await pending;
    expect(ports.create).not.toHaveBeenCalled();
    run.activate();
    await load();
    expect(run.snapshot().uncertain).toBe(false);
  });
  it.each(["create", "delete"] as const)(
    "aborts %s and ignores late navigation/cache callbacks after blur",
    async (kind) => {
      const { run, ports, load } = await ready();
      const response = deferred<AiConversationSummary>();
      ports.create.mockReturnValue(response.promise);
      ports.remove.mockImplementation(async () => {
        await response.promise;
      });
      const pending = kind === "create" ? run.create() : run.remove(id);
      await vi.waitFor(() =>
        expect(
          kind === "create" ? ports.create : ports.remove,
        ).toHaveBeenCalledOnce(),
      );
      const signal =
        kind === "create"
          ? ports.create.mock.calls[0][0]
          : ports.remove.mock.calls[0][1];
      run.dispose();
      expect(signal.aborted).toBe(true);
      const changes = ports.changed.mock.calls.length;
      response.resolve(item);
      await pending;
      expect(ports.created).not.toHaveBeenCalled();
      expect(ports.removed).not.toHaveBeenCalled();
      expect(ports.changed.mock.calls.length).toBe(changes);
      run.activate();
      expect(run.snapshot()).toMatchObject({
        ready: false,
        uncertain: true,
        reviewed: false,
      });
      await load();
      expect(run.snapshot().reviewed).toBe(true);
    },
  );
  it("keeps the old lease through disposal and requires a read after settlement", async () => {
    const { run, ports, load } = await ready();
    const old = deferred<AiConversationSummary>(),
      next = deferred<AiConversationSummary>();
    ports.create
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    const first = run.create();
    await vi.waitFor(() => expect(ports.create).toHaveBeenCalledOnce());
    run.dispose();
    run.activate();
    await load();
    run.acknowledgeReview();
    expect(await run.create()).toBe(false);
    expect(ports.create).toHaveBeenCalledOnce();
    old.resolve(item);
    await first;
    expect(run.snapshot()).toMatchObject({
      busy: null,
      uncertain: true,
      reviewed: false,
    });
    run.acknowledgeReview();
    expect(await run.create()).toBe(false);
    await load();
    run.acknowledgeReview();
    const second = run.create();
    await vi.waitFor(() => expect(ports.create).toHaveBeenCalledTimes(2));
    expect(run.snapshot().busy).toBe("create");
    await run.create();
    expect(ports.create).toHaveBeenCalledTimes(2);
    next.resolve(item);
    await second;
    expect(ports.created).toHaveBeenCalledOnce();
  });
  it("keeps a confirmed create successful if a local navigation/cache callback fails", async () => {
    const { run, ports } = await ready();
    ports.created.mockImplementation(() => {
      throw new Error("local callback");
    });
    await expect(run.create()).resolves.toBe(true);
    expect(run.snapshot()).toMatchObject({ uncertain: false, busy: null });
    expect(run.snapshot().error).toContain("操作已完成");
  });
  it("does not mark confirmed navigation as uncertain when navigation synchronously blurs the screen", async () => {
    const { run, ports } = await ready();
    ports.created.mockImplementation(() => run.dispose());
    await run.create();
    expect(run.snapshot().uncertain).toBe(false);
  });
});
describe("unknown write result and explicit review", () => {
  it.each([0, 408, 500, 502])(
    "does not automatically repeat an uncertain %s result",
    async (status) => {
      const { run, ports, load } = await ready();
      ports.create.mockRejectedValue(apiError(status));
      await run.create();
      await run.create();
      await run.remove(id);
      run.acknowledgeReview();
      expect(ports.create).toHaveBeenCalledOnce();
      expect(ports.remove).not.toHaveBeenCalled();
      expect(run.snapshot()).toMatchObject({
        uncertain: true,
        reviewed: false,
      });
      await load();
      expect(run.snapshot().uncertain).toBe(true);
      await run.create();
      expect(ports.create).toHaveBeenCalledOnce();
      run.acknowledgeReview();
      expect(run.snapshot().uncertain).toBe(false);
    },
  );
  it.each([400, 401, 403, 404, 409, 429])(
    "reports a definitive %s rejection without unknown-result recovery",
    async (status) => {
      const { run, ports } = await ready();
      ports.create.mockRejectedValue(apiError(status));
      await run.create();
      expect(run.snapshot()).toMatchObject({ uncertain: false, busy: null });
      expect(ports.create).toHaveBeenCalledOnce();
    },
  );
  it("does not unlock after a review read fails", async () => {
    const { run, ports, load } = await ready();
    ports.create.mockRejectedValue(new Error("offline"));
    await run.create();
    ports.list.mockRejectedValue(new Error("offline"));
    await expect(load()).rejects.toThrow();
    run.acknowledgeReview();
    expect(run.snapshot()).toMatchObject({
      uncertain: true,
      reviewed: false,
      ready: false,
    });
  });
  it("a list read started before the uncertain write result is insufficient to acknowledge it", async () => {
    const { run, ports, load } = await ready();
    const write = deferred<AiConversationSummary>(),
      read = deferred<AiConversationPage>();
    ports.create.mockReturnValue(write.promise);
    ports.list.mockReturnValue(read.promise);
    const pendingWrite = run.create();
    await vi.waitFor(() => expect(ports.create).toHaveBeenCalledOnce());
    const pendingRead = load();
    write.reject(new Error("offline"));
    await pendingWrite;
    read.resolve(page);
    await pendingRead;
    run.acknowledgeReview();
    expect(run.snapshot()).toMatchObject({ uncertain: true, reviewed: false });
  });
  it("a malformed created ID cannot navigate and leaves the potentially committed result uncertain", async () => {
    const { run, ports } = await ready();
    ports.create.mockResolvedValue({ ...item, conversationId: "../settings" });
    await run.create();
    expect(ports.created).not.toHaveBeenCalled();
    expect(run.snapshot().uncertain).toBe(true);
  });
});
describe("list reads and pagination", () => {
  it("verifies identity before every read and does not call list after denial", async () => {
    const { run, ports, load } = setup();
    run.activate();
    ports.verify.mockRejectedValue(apiError(403));
    await expect(load()).rejects.toMatchObject({ status: 403 });
    expect(ports.list).not.toHaveBeenCalled();
  });
  it.each(["query", "focus"] as const)(
    "cancels a pending read on %s cancellation and ignores late data",
    async (source) => {
      const { run, ports } = await ready();
      const read = deferred<AiConversationPage>();
      ports.list.mockReturnValue(read.promise);
      const controller = new AbortController();
      const pending = run.loadPage(1, controller.signal);
      await vi.waitFor(() => expect(ports.list).toHaveBeenCalledTimes(2));
      const signal = ports.list.mock.calls[1][1];
      if (source === "query") controller.abort();
      else run.dispose();
      expect(signal.aborted).toBe(true);
      read.resolve(page);
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(run.snapshot().ready).toBe(false);
    },
  );
  it("does not publish an old read into a new focus lifetime", async () => {
    const { run, ports, load } = await ready();
    const old = deferred<AiConversationPage>();
    ports.list.mockReturnValueOnce(old.promise);
    const pending = load();
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(ports.list).toHaveBeenCalledTimes(2));
    run.dispose();
    run.activate();
    await load();
    const before = ports.changed.mock.calls.length;
    old.resolve(page);
    await rejected;
    expect(ports.changed.mock.calls.length).toBe(before);
    expect(run.snapshot().ready).toBe(true);
  });
  it.each([0, -1, 1.5, Infinity, 107374184])(
    "rejects invalid/out-of-int4 page %s before any request",
    async (value) => {
      const { run, ports } = setup();
      run.activate();
      await expect(
        run.loadPage(value, new AbortController().signal),
      ).rejects.toThrow("Invalid conversation page");
      expect(ports.verify).not.toHaveBeenCalled();
    },
  );
  it.each(["bad", "../7", "", "0"])(
    "does not delete an invalid ID %s",
    async (value) => {
      const { run, ports } = await ready();
      await run.remove(value);
      expect(ports.remove).not.toHaveBeenCalled();
    },
  );
  it("uses an actual total to recover a deleted last page or an empty account", () => {
    expect(lastConversationPage(21)).toBe(2);
    expect(lastConversationPage(20)).toBe(1);
    expect(lastConversationPage(0)).toBe(1);
    expect(lastConversationPage(5, 2)).toBe(3);
  });
  it("uses list-specific messages for rate and state conflicts", () => {
    expect(aiListErrorMessage(apiError(429))).not.toContain("5 条");
    expect(aiListErrorMessage(apiError(409))).toContain("会话状态");
  });
});
