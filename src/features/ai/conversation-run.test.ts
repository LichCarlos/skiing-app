import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../platform/api/api-error";
import {
  AiConversationRun,
  aiConversationId,
  visibleConfirmedTurns,
} from "./conversation-run";
import type { AiMessage } from "./ai-api";
vi.mock("../../platform/api/api-client", () => ({
  apiRequest: vi.fn(),
  apiStreamRequest: vi.fn(),
}));
const message: AiMessage = {
  messageId: "12",
  role: "assistant",
  status: "complete",
  content: "雪道回答",
  citations: [],
  createdAt: "2026-10-31T00:00:00Z",
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  let counter = 0;
  const ports = {
    requestId: vi.fn(() => `request-${++counter}`),
    verify: vi.fn(async (_signal: AbortSignal) => {}),
    send: vi.fn(
      async (
        _request: { clientRequestId: string; content: string },
        _delta: (text: string) => void,
        _signal: AbortSignal,
      ) => message,
    ),
    changed: vi.fn(),
    confirmed: vi.fn(),
  };
  const run = new AiConversationRun(ports);
  run.activate();
  ports.changed.mockClear();
  return { run, ports };
}
describe("AI conversation lifetime", () => {
  it.each([401, 403, 404])(
    "hides local responses on access failure and restores only after fresh authorized history (%s)",
    async (status) => {
      const { run, ports } = fixture();
      await run.send("first");
      ports.send.mockImplementationOnce(async (_request, delta) => {
        delta("private partial");
        throw new ApiError("private error", {
          status,
          code: null,
          traceId: null,
        });
      });
      await run.send("second");
      expect(run.snapshot()).toMatchObject({
        denied: true,
        partial: "",
        confirmed: [],
        sending: false,
        pending: { content: "second" },
      });
      expect(await run.retry()).toBe(false);
      expect(run.edit()).toBeNull();
      run.observeHistory([]);
      expect(run.snapshot()).toMatchObject({ denied: false, error: null });
      await run.retry();
      expect(ports.send.mock.calls[2][0]).toEqual(ports.send.mock.calls[1][0]);
    },
  );
  it("locks synchronously before identity validation and rejects competing send/retry/edit", async () => {
    const { run, ports } = fixture(),
      auth = deferred<void>();
    ports.verify.mockReturnValue(auth.promise);
    const result = run.send("  问题  ");
    expect(run.snapshot()).toMatchObject({
      sending: true,
      pending: { clientRequestId: "request-1", content: "问题" },
    });
    expect(await run.send("other")).toBe(false);
    expect(await run.retry()).toBe(false);
    expect(run.edit()).toBeNull();
    expect(ports.send).not.toHaveBeenCalled();
    auth.resolve();
    expect(await result).toBe(true);
    expect(ports.send).toHaveBeenCalledOnce();
    expect(ports.requestId).toHaveBeenCalledOnce();
    expect(run.snapshot()).toMatchObject({
      sending: false,
      pending: null,
      partial: "",
      confirmed: [
        { request: { clientRequestId: "request-1", content: "问题" }, message },
      ],
    });
    expect(ports.confirmed).toHaveBeenCalledOnce();
  });
  it.each(["", " \t ", "雪".repeat(4001), "😀".repeat(4001)])(
    "rejects invalid input without calling transport",
    async (content) => {
      const { run, ports } = fixture();
      expect(await run.send(content)).toBe(false);
      expect(ports.verify).not.toHaveBeenCalled();
      expect(ports.send).not.toHaveBeenCalled();
    },
  );
  it("accepts 4000 Unicode code points and never trims an existing retry DTO differently", async () => {
    const { run, ports } = fixture();
    expect(await run.send(` ${"😀".repeat(4000)} `)).toBe(true);
    expect(Array.from(ports.send.mock.calls[0][0].content)).toHaveLength(4000);
  });
  it("retains the exact request for explicit retry and never auto retries a failure", async () => {
    const { run, ports } = fixture();
    ports.send.mockRejectedValueOnce(new Error("private failure"));
    expect(await run.send(" question ")).toBe(false);
    expect(run.snapshot()).toMatchObject({
      sending: false,
      pending: { clientRequestId: "request-1", content: "question" },
      confirmed: [],
    });
    expect(ports.send).toHaveBeenCalledOnce();
    expect(await run.send("new question")).toBe(false);
    expect(await run.retry()).toBe(true);
    expect(ports.send.mock.calls.map((call) => call[0])).toEqual([
      { clientRequestId: "request-1", content: "question" },
      { clientRequestId: "request-1", content: "question" },
    ]);
    expect(ports.requestId).toHaveBeenCalledOnce();
  });
  it("editing after an uncertain result deliberately creates a new request", async () => {
    const { run, ports } = fixture();
    ports.send.mockRejectedValueOnce(new Error("offline"));
    await run.send("same");
    expect(run.edit()).toBe("same");
    expect(run.snapshot().pending).toBeNull();
    await run.send("same");
    expect(ports.send.mock.calls[1][0].clientRequestId).toBe("request-2");
  });
  it.each([401, 403])(
    "does not send when fresh identity verification fails (%s)",
    async (status) => {
      const { run, ports } = fixture();
      ports.verify.mockRejectedValue(
        new ApiError("private", { status, code: null, traceId: "trace" }),
      );
      expect(await run.send("question")).toBe(false);
      expect(ports.send).not.toHaveBeenCalled();
      expect(run.snapshot().pending?.clientRequestId).toBe("request-1");
      expect(run.snapshot().error).not.toContain("private");
    },
  );
  it("stops during identity validation and does not start a late send", async () => {
    const { run, ports } = fixture(),
      auth = deferred<void>();
    ports.verify.mockReturnValue(auth.promise);
    const result = run.send("q");
    run.stop();
    expect(ports.verify.mock.calls[0][0].aborted).toBe(true);
    auth.resolve();
    expect(await result).toBe(false);
    expect(ports.send).not.toHaveBeenCalled();
    expect(run.snapshot()).toMatchObject({
      sending: false,
      pending: { clientRequestId: "request-1" },
    });
  });
  it("stops without waiting for a blocked stream and ignores late delta/success/finally from it", async () => {
    const { run, ports } = fixture(),
      old = deferred<AiMessage>(),
      current = deferred<AiMessage>();
    ports.send
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const first = run.send("q");
    await vi.waitFor(() => expect(ports.send).toHaveBeenCalledOnce());
    ports.send.mock.calls[0][1]("old partial");
    expect(run.snapshot().partial).toBe("old partial");
    run.stop();
    expect(ports.send.mock.calls[0][2].aborted).toBe(true);
    const second = run.retry();
    await vi.waitFor(() => expect(ports.send).toHaveBeenCalledTimes(2));
    ports.send.mock.calls[0][1]("stale");
    old.resolve({ ...message, messageId: "10" });
    await first;
    expect(run.snapshot()).toMatchObject({
      sending: true,
      partial: "",
      confirmed: [],
    });
    ports.send.mock.calls[1][1]("current");
    current.resolve(message);
    expect(await second).toBe(true);
    expect(run.snapshot().confirmed).toHaveLength(1);
    expect(ports.confirmed).toHaveBeenCalledOnce();
  });
  it.each(["success", "error"])(
    "suppresses callbacks after account/conversation unmount (%s)",
    async (outcome) => {
      const { run, ports } = fixture(),
        late = deferred<AiMessage>();
      ports.send.mockReturnValue(late.promise);
      const result = run.send("q");
      await vi.waitFor(() => expect(ports.send).toHaveBeenCalledOnce());
      run.dispose();
      ports.changed.mockClear();
      ports.send.mock.calls[0][1]("late");
      if (outcome === "success") late.resolve(message);
      else late.reject(new Error("late"));
      expect(await result).toBe(false);
      expect(ports.changed).not.toHaveBeenCalled();
      expect(ports.confirmed).not.toHaveBeenCalled();
      expect(await run.send("after unmount")).toBe(false);
    },
  );
  it("restores stopped state on screen focus without resending automatically", async () => {
    const { run, ports } = fixture(),
      late = deferred<AiMessage>();
    ports.send.mockReturnValueOnce(late.promise);
    const result = run.send("q");
    await vi.waitFor(() => expect(ports.send).toHaveBeenCalledOnce());
    run.dispose();
    run.activate();
    expect(run.snapshot()).toMatchObject({
      sending: false,
      pending: { clientRequestId: "request-1" },
      error: expect.stringContaining("已停止接收"),
    });
    late.resolve(message);
    await result;
    expect(run.snapshot().confirmed).toEqual([]);
    expect(ports.send).toHaveBeenCalledOnce();
    expect(await run.retry()).toBe(true);
  });
  it("keeps confirmed responses distinct for repeated identical questions", async () => {
    const { run, ports } = fixture();
    ports.send
      .mockResolvedValueOnce(message)
      .mockResolvedValueOnce({ ...message, messageId: "14" });
    await run.send("same");
    await run.send("same");
    expect(
      run.snapshot().confirmed.map((turn) => turn.message.messageId),
    ).toEqual(["12", "14"]);
    expect(
      run.snapshot().confirmed.map((turn) => turn.request.clientRequestId),
    ).toEqual(["request-1", "request-2"]);
    const history = [{ messageId: "12", content: "same" }];
    expect(
      visibleConfirmedTurns(run.snapshot().confirmed, history).map(
        (turn) => turn.message.messageId,
      ),
    ).toEqual(["14"]);
    run.observeHistory(history);
    expect(
      run.snapshot().confirmed.map((turn) => turn.message.messageId),
    ).toEqual(["14"]);
  });
  it("does not reconcile on matching content, only on persisted message ID", async () => {
    const { run } = fixture();
    await run.send("same");
    run.observeHistory([{ messageId: "11" }]);
    expect(run.snapshot().confirmed).toHaveLength(1);
    run.observeHistory([{ messageId: "12" }]);
    expect(run.snapshot().confirmed).toEqual([]);
  });
  it("never manufactures user messages or IDs in the authoritative history", async () => {
    const { run } = fixture();
    const history = Object.freeze([
      { ...message, role: "user" as const, messageId: "9" },
    ]);
    await run.send("same");
    expect(
      visibleConfirmedTurns(run.snapshot().confirmed, history),
    ).toHaveLength(1);
    expect(history).toHaveLength(1);
    expect(history[0].messageId).toBe("9");
    expect(run.snapshot().confirmed[0].message).toEqual(message);
  });
  it("keeps a saved reply confirmed if invalidation fails synchronously", async () => {
    const { run, ports } = fixture();
    ports.confirmed.mockImplementation(() => {
      throw new Error("cache unavailable");
    });
    expect(await run.send("q")).toBe(true);
    expect(run.snapshot()).toMatchObject({
      pending: null,
      error: null,
      confirmed: [{ message }],
    });
  });
});
describe("AI URL IDs", () => {
  it("accepts a canonical UUID and normalizes case", () => {
    expect(aiConversationId("E9B35D28-193F-46F6-BDF4-DD6C9194AD25")).toBe(
      "e9b35d28-193f-46f6-bdf4-dd6c9194ad25",
    );
  });
  it.each(
    [
      undefined,
      null,
      [],
      ["e9b35d28-193f-46f6-bdf4-dd6c9194ad25"],
      "12345678-abcdefghijklmnopqrstuvwxyza",
      "e9b35d28-193f-46f6-7df4-dd6c9194ad25",
      "e9b35d28-193f-46f6-bdf4-dd6c9194ad25/extra",
      "01",
    ].map((value) => ({ value })),
  )("rejects malformed parameter %j", ({ value }) => {
    expect(aiConversationId(value)).toBeNull();
  });
});
