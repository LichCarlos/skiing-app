import { afterEach, describe, expect, it, vi } from "vitest";
import {
  citationRoute,
  createConversation,
  deleteConversation,
  listConversations,
  sendAiMessage,
  verifyAiAccount,
} from "./ai-api";
import { apiRequest, apiStreamRequest } from "../../platform/api/api-client";

vi.mock("../../platform/api/api-client", () => ({
  apiRequest: vi.fn(),
  apiStreamRequest: vi.fn(),
}));
const message = {
  messageId: "12",
  role: "assistant",
  status: "complete",
  content: "雪场🙂",
  citations: [],
  createdAt: "2026-10-29T00:00:00Z",
};
const body = {
  clientRequestId: "e9b35d28-193f-46f6-bdf4-dd6c9194ad25",
  content: "滑雪",
};
function response(text: string, chunkSize = 1) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        // Deliberately split every UTF-8 character and every SSE delimiter.
        for (let offset = 0; offset < bytes.length; offset += chunkSize)
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
afterEach(() => vi.clearAllMocks());

describe("AI conversation list transport", () => {
  it("reads only the selected page without accepting an owner parameter", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValue({
      items: [],
      total: 0,
      page: 2,
      pageSize: 20,
    });
    await listConversations(2, signal);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      "/ai/conversations?page=2&pageSize=20",
      { signal, cache: "no-store" },
    );
  });
  it("creates with the approved empty DTO and passes lifecycle cancellation", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValue({ conversationId: "id" });
    await createConversation(signal);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/ai/conversations", {
      method: "POST",
      body: {},
      signal,
    });
  });
  it("uses DELETE with an encoded ID, no body and no automatic write loop", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockRejectedValue(new Error("offline"));
    await expect(deleteConversation("a/b", signal)).rejects.toThrow("offline");
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      "/ai/conversations/a%2Fb",
      { method: "DELETE", signal },
    );
  });
});

describe("AI stream transport", () => {
  it("maps public citations to App routes and rejects generated or unsupported destinations", () => {
    const citation = {
      sourceType: "resort" as const,
      sourceId: "2",
      title: "雪场",
      excerpt: "",
      href: "javascript:alert(1)",
    };
    expect(citationRoute(citation)).toBe("/resorts/2");
    expect(citationRoute({ ...citation, sourceType: "project" })).toBeNull();
    expect(citationRoute({ ...citation, sourceId: "../settings" })).toBeNull();
  });
  it("decodes split Chinese/emoji, ignores heartbeats, and returns the persisted completion", async () => {
    vi.mocked(apiStreamRequest).mockResolvedValue(
      response(
        `: heartbeat\r\n\r\nevent: delta\r\ndata: {"text":"雪场🙂"}\r\n\r\nevent: completed\r\ndata: ${JSON.stringify(message)}\r\n\r\n`,
      ),
    );
    const delta = vi.fn();
    await expect(
      sendAiMessage("owned", body, delta, new AbortController().signal),
    ).resolves.toEqual(message);
    expect(delta).toHaveBeenCalledExactlyOnceWith("雪场🙂");
    expect(apiStreamRequest).toHaveBeenCalledWith(
      "/ai/conversations/owned/messages",
      expect.objectContaining({ method: "POST", body }),
    );
  });
  it("does not treat an interrupted delta-only response as a saved reply", async () => {
    vi.mocked(apiStreamRequest).mockResolvedValue(
      response('event: delta\ndata: {"text":"未完成"}\n\n'),
    );
    await expect(
      sendAiMessage("id", body, vi.fn(), new AbortController().signal),
    ).rejects.toThrow("尚未确认保存");
    expect(apiStreamRequest).toHaveBeenCalledOnce();
  });
  it("rejects SSE error and malformed completion without silently retrying the model", async () => {
    vi.mocked(apiStreamRequest).mockResolvedValueOnce(
      response(
        'event: error\ndata: {"code":"AI_GENERATION_FAILED","traceId":"trace"}\n\n',
      ),
    );
    await expect(
      sendAiMessage("id", body, vi.fn(), new AbortController().signal),
    ).rejects.toMatchObject({ traceId: "trace", status: 502 });
    vi.mocked(apiStreamRequest).mockResolvedValueOnce(
      response('event: completed\ndata: {"content":"bad"}\n\n'),
    );
    await expect(
      sendAiMessage("id", body, vi.fn(), new AbortController().signal),
    ).rejects.toThrow("Invalid AI completed");
  });
  it("uses the same request key on an explicit replay and accepts completion without deltas", async () => {
    vi.mocked(apiStreamRequest).mockImplementation(async () =>
      response(`event: completed\ndata: ${JSON.stringify(message)}\n\n`),
    );
    const delta = vi.fn();
    await sendAiMessage("id", body, delta, new AbortController().signal);
    await sendAiMessage("id", body, delta, new AbortController().signal);
    expect(delta).not.toHaveBeenCalled();
    expect(
      vi.mocked(apiStreamRequest).mock.calls.map((call) => call[1].body),
    ).toEqual([body, body]);
  });
  it("cancels and releases the response reader after caller cancellation", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    vi.mocked(apiStreamRequest).mockResolvedValue(
      new Response(new ReadableStream({ cancel })),
    );
    controller.abort();
    await expect(
      sendAiMessage("id", body, vi.fn(), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("aborts an already pending reader read without waiting for another network chunk", async () => {
    const cancel = vi.fn(),
      controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.mocked(apiStreamRequest).mockResolvedValue(new Response(stream));
    const read = sendAiMessage("id", body, vi.fn(), controller.signal);
    await vi.waitFor(() => expect(stream.locked).toBe(true));
    controller.abort();
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });
  it("does not publish a late chunk delivered after cancellation", async () => {
    const abort = new AbortController(),
      delta = vi.fn();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        source = controller;
      },
    });
    vi.mocked(apiStreamRequest).mockResolvedValue(new Response(stream));
    const read = sendAiMessage("id", body, delta, abort.signal);
    await vi.waitFor(() => expect(stream.locked).toBe(true));
    source.enqueue(
      new TextEncoder().encode('event: delta\ndata: {"text":"late"}\n\n'),
    );
    abort.abort();
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(delta).not.toHaveBeenCalled();
    expect(stream.locked).toBe(false);
  });
  it("rejects malformed UTF-8 rather than silently replacing generated content", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff]));
        controller.close();
      },
    });
    vi.mocked(apiStreamRequest).mockResolvedValue(new Response(stream));
    await expect(
      sendAiMessage("id", body, vi.fn(), new AbortController().signal),
    ).rejects.toThrow();
    expect(stream.locked).toBe(false);
  });
  it("verifies exact account identity and use permission without caching", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValue({
      userId: 7,
      permissionKeys: ["ai:conversation:use"],
    });
    await expect(verifyAiAccount(7, signal)).resolves.toBeUndefined();
    expect(apiRequest).toHaveBeenCalledWith("/auth/me", {
      signal,
      cache: "no-store",
    });
    await expect(verifyAiAccount(8, signal)).rejects.toMatchObject({
      status: 403,
    });
    vi.mocked(apiRequest).mockResolvedValue({ userId: 7, permissionKeys: [] });
    await expect(verifyAiAccount(7, signal)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("does not continue after a cancelled identity read resolves late", async () => {
    const abort = new AbortController();
    let resolve!: (value: unknown) => void;
    vi.mocked(apiRequest).mockReturnValue(
      new Promise((yes) => {
        resolve = yes;
      }),
    );
    const read = verifyAiAccount(7, abort.signal);
    abort.abort();
    resolve({ userId: 7, permissionKeys: ["ai:conversation:use"] });
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
  });
  it.each([
    { content: "" },
    { content: " " },
    { content: "x".repeat(100_001) },
    { messageId: "0" },
    { messageId: "-1" },
    { createdAt: "not-a-date" },
  ])("rejects invalid persisted completions", async (overrides) => {
    vi.mocked(apiStreamRequest).mockResolvedValue(
      response(
        `event: completed\ndata: ${JSON.stringify({ ...message, ...overrides })}\n\n`,
        4096,
      ),
    );
    await expect(
      sendAiMessage("id", body, vi.fn(), new AbortController().signal),
    ).rejects.toThrow("Invalid AI completed");
  });
  it("bounds accumulated delta output across many separate events", async () => {
    vi.mocked(apiStreamRequest).mockResolvedValue(
      response(
        "event: delta\ndata: " +
          JSON.stringify({ text: "x".repeat(50_001) }) +
          "\n\n" +
          "event: delta\ndata: " +
          JSON.stringify({ text: "x".repeat(50_001) }) +
          "\n\n",
        4096,
      ),
    );
    const delta = vi.fn();
    await expect(
      sendAiMessage("id", body, delta, new AbortController().signal),
    ).rejects.toThrow("output limit");
    expect(delta).toHaveBeenCalledOnce();
  });
  it.each(["constructor", "toString", "__proto__", "revenue"])(
    "rejects unknown/prototype citation type %s",
    (sourceType) => {
      expect(
        citationRoute({
          sourceType,
          sourceId: "7",
          title: "x",
          excerpt: "",
          href: null,
        } as unknown as Parameters<typeof citationRoute>[0]),
      ).toBeNull();
    },
  );
  it.each(["0", "01", "2147483648", "99999999999999999999999", "../7"])(
    "rejects non-int4 citation ID %s",
    (sourceId) => {
      expect(
        citationRoute({
          sourceType: "resort",
          sourceId,
          title: "x",
          excerpt: "",
          href: null,
        }),
      ).toBeNull();
    },
  );
});
