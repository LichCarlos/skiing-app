import { describe, expect, it, vi } from "vitest";
vi.mock("../../platform/api/api-client", () => ({
  apiRequest: vi.fn(),
  apiStreamRequest: vi.fn(),
}));
import { AiTurnRecovery, aiTurnRecoveryFor } from "./turn-recovery";
import { AiConversationRun } from "./conversation-run";
import { ApiError } from "../../platform/api/api-error";
import type { AiMessage, SendAiMessage } from "./ai-api";
const id = "e9b35d28-193f-46f6-bdf4-dd6c9194ad25",
  otherId = "e9b35d28-193f-46f6-bdf4-dd6c9194ad26";
const message: AiMessage = {
  messageId: "7",
  role: "assistant",
  status: "complete",
  content: "answer",
  citations: [],
  createdAt: "2026-11-03T00:00:00Z",
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(recovery: AiTurnRecovery) {
  const ports = {
    requestId: vi.fn(() => "new-key"),
    verify: vi.fn(async () => {}),
    send: vi.fn(
      async (
        _request: SendAiMessage,
        _delta: (text: string) => void,
        _signal: AbortSignal,
      ) => message,
    ),
    changed: vi.fn(),
    confirmed: vi.fn(),
  };
  const run = new AiConversationRun(ports, recovery);
  run.activate();
  return { run, ports };
}
describe("AI original turn recovery across complete screen replacement", () => {
  it("retains the exact trimmed original DTO and retries explicitly after completion loss", async () => {
    const recovery = new AiTurnRecovery(),
      a = setup(recovery);
    a.ports.send.mockRejectedValueOnce(new Error("completion lost"));
    expect(await a.run.send("  original question  ")).toBe(false);
    const original = a.ports.send.mock.calls[0][0];
    a.run.dispose();
    const b = setup(recovery);
    expect(b.run.snapshot().pending).toEqual(original);
    expect(b.run.snapshot().partial).toBe("");
    expect(await b.run.send("new duplicate")).toBe(false);
    expect(b.ports.requestId).not.toHaveBeenCalled();
    expect(b.ports.send).not.toHaveBeenCalled();
    expect(await b.run.retry()).toBe(true);
    expect(b.ports.send.mock.calls[0][0]).toEqual(original);
    expect(recovery.snapshot()).toEqual({ busy: false, pending: null });
  });
  it("shares a synchronous active lease before the first verification await", async () => {
    const recovery = new AiTurnRecovery(),
      a = setup(recovery),
      b = setup(recovery),
      wait = deferred<void>();
    a.ports.verify.mockImplementationOnce(() => wait.promise);
    const saving = a.run.send("q");
    expect(b.run.snapshot().sending).toBe(true);
    expect(await b.run.send("other")).toBe(false);
    expect(await b.run.retry()).toBe(false);
    expect(b.run.edit()).toBeNull();
    expect(b.ports.send).not.toHaveBeenCalled();
    wait.resolve();
    await saving;
    expect(b.run.snapshot()).toMatchObject({
      sending: false,
      pending: null,
      error: null,
    });
  });
  it.each(["success", "failure"])(
    "old detached %s cannot clear a new retry or publish stale text",
    async (outcome) => {
      const recovery = new AiTurnRecovery(),
        a = setup(recovery),
        old = deferred<AiMessage>();
      a.ports.send.mockReturnValueOnce(old.promise);
      const first = a.run.send("q");
      await vi.waitFor(() => expect(a.ports.send).toHaveBeenCalledOnce());
      a.run.dispose();
      const changes = a.ports.changed.mock.calls.length;
      const b = setup(recovery),
        next = deferred<AiMessage>();
      b.ports.send.mockReturnValueOnce(next.promise);
      const retry = b.run.retry();
      await vi.waitFor(() => expect(b.ports.send).toHaveBeenCalledOnce());
      a.ports.send.mock.calls[0][1]("stale private delta");
      if (outcome === "success") old.resolve(message);
      else old.reject(new Error("late"));
      await first;
      expect(a.ports.changed).toHaveBeenCalledTimes(changes);
      expect(a.ports.confirmed).not.toHaveBeenCalled();
      expect(b.run.snapshot()).toMatchObject({
        sending: true,
        pending: { content: "q" },
        partial: "",
        confirmed: [],
      });
      next.resolve(message);
      expect(await retry).toBe(true);
      expect(b.run.snapshot().confirmed).toHaveLength(1);
    },
  );
  it("uses the original key after stopping the old stream before it settles", async () => {
    const recovery = new AiTurnRecovery(),
      a = setup(recovery),
      old = deferred<AiMessage>();
    a.ports.send.mockReturnValueOnce(old.promise);
    const saving = a.run.send("q");
    await vi.waitFor(() => expect(a.ports.send).toHaveBeenCalledOnce());
    a.run.stop();
    const b = setup(recovery);
    expect(await b.run.retry()).toBe(true);
    expect(b.ports.send.mock.calls[0][0]).toEqual(
      a.ports.send.mock.calls[0][0],
    );
    old.resolve(message);
    await saving;
    expect(recovery.snapshot().pending).toBeNull();
  });
  it("a denied instance cannot retry or edit until fresh authorized history is observed", async () => {
    const recovery = new AiTurnRecovery(),
      a = setup(recovery);
    a.ports.send.mockRejectedValueOnce(
      new ApiError("denied", { status: 403, code: null, traceId: null }),
    );
    await a.run.send("q");
    expect(await a.run.retry()).toBe(false);
    expect(a.run.edit()).toBeNull();
    a.run.dispose();
    const b = setup(recovery);
    b.ports.verify.mockRejectedValueOnce(
      new ApiError("denied", { status: 403, code: null, traceId: null }),
    );
    expect(await b.run.retry()).toBe(false);
    expect(b.ports.send).not.toHaveBeenCalled();
    expect(b.run.snapshot().denied).toBe(true);
    b.run.observeHistory([]);
    expect(await b.run.retry()).toBe(true);
  });
  it("editing after uncertainty is deliberate and clears all instances before a new key", async () => {
    const recovery = new AiTurnRecovery(),
      a = setup(recovery);
    a.ports.send.mockRejectedValueOnce(new Error("lost"));
    await a.run.send("q");
    a.run.dispose();
    const b = setup(recovery),
      c = setup(recovery);
    expect(b.run.edit()).toBe("q");
    expect(c.run.snapshot().pending).toBeNull();
    b.ports.requestId.mockReturnValueOnce("different-key");
    expect(await b.run.send("q")).toBe(true);
    expect(b.ports.send.mock.calls[0][0].clientRequestId).toBe("different-key");
  });
  it("same account/conversation/runtime shares recovery, other accounts/conversations/runtimes remain isolated", () => {
    const runtime = {},
      recovery = aiTurnRecoveryFor(runtime, 7, id),
      lease = recovery.begin({
        clientRequestId: "original",
        content: "private question",
      })!;
    lease.finish(false);
    expect(aiTurnRecoveryFor(runtime, 7, id.toUpperCase())).toBe(recovery);
    for (const other of [
      aiTurnRecoveryFor(runtime, 8, id),
      aiTurnRecoveryFor(runtime, 7, otherId),
      aiTurnRecoveryFor({}, 7, id),
    ])
      expect(other.snapshot()).toEqual({ busy: false, pending: null });
  });
  it.each([0, -1, 1.5, 2147483648])(
    "rejects invalid account context %s",
    (userId) => {
      expect(() => aiTurnRecoveryFor({}, userId, id)).toThrow();
    },
  );
  it("rejects invalid conversation context", () => {
    expect(() => aiTurnRecoveryFor({}, 7, "bad-id")).toThrow();
  });
  it("does not replace a pending key with a different DTO or allow an obsolete owner to clear it", () => {
    const recovery = new AiTurnRecovery(),
      first = recovery.begin({ clientRequestId: "a", content: "q" })!;
    first.finish(false);
    expect(recovery.begin({ clientRequestId: "b", content: "q" })).toBeNull();
    expect(
      recovery.begin({ clientRequestId: "a", content: "other" }),
    ).toBeNull();
    const second = recovery.begin({ clientRequestId: "a", content: "q" })!;
    first.finish(true);
    expect(recovery.snapshot().busy).toBe(true);
    second.finish(true);
    expect(recovery.snapshot().pending).toBeNull();
  });
  it("copies the caller DTO and a failing observer cannot release ownership", () => {
    const recovery = new AiTurnRecovery(),
      input = { clientRequestId: "a", content: "q" };
    recovery.subscribe(() => {
      throw new Error("observer");
    });
    const lease = recovery.begin(input)!;
    input.content = "changed";
    expect(recovery.snapshot()).toMatchObject({
      busy: true,
      pending: { content: "q" },
    });
    lease.finish(false);
    expect(recovery.snapshot().busy).toBe(false);
  });
});
