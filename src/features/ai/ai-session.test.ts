import { beforeEach, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ epoch: 4 }));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => identity.epoch,
  assertSessionEpoch: (epoch: number) => {
    if (epoch !== identity.epoch)
      throw new DOMException("Session changed", "AbortError");
  },
}));
vi.mock("../../platform/api/api-client", () => ({
  apiRequest: vi.fn(),
  apiStreamRequest: vi.fn(),
}));
import { apiRequest, apiStreamRequest } from "../../platform/api/api-client";
import { createAiSession, aiKeys } from "./ai-session";
const id = "e9b35d28-193f-46f6-bdf4-dd6c9194ad25";
const item = {
  conversationId: id,
  title: null,
  status: "active",
  createdAt: "2026-11-02T00:00:00Z",
  updatedAt: "2026-11-02T00:00:00Z",
  messageCount: 0,
};
const me = { userId: 7, permissionKeys: ["ai:conversation:use"] };
const signal = () => new AbortController().signal;
beforeEach(() => {
  identity.epoch = 4;
  vi.resetAllMocks();
});
describe("captured AI account/session boundary", () => {
  it("binds every history/identity read to the same epoch and checks identity again after data", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      path === "/auth/me" ? me : { ...item, messages: [] },
    );
    expect(await createAiSession(7).read(id, signal())).toMatchObject({
      conversationId: id,
    });
    expect(vi.mocked(apiRequest).mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      `/ai/conversations/${id}`,
      "/auth/me",
    ]);
    for (const [, options] of vi.mocked(apiRequest).mock.calls)
      expect(options).toMatchObject({
        cache: "no-store",
        expectedSessionEpoch: 4,
      });
  });
  it("rejects old lifetimes before a request even when the account ID is unchanged", async () => {
    const session = createAiSession(7);
    identity.epoch++;
    await expect(session.verify(signal())).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(session.create(signal())).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(session.remove(id, signal())).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("does not expose a list when a different account is returned after the data read", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      path === "/auth/me"
        ? { ...me, userId: 8 }
        : { items: [item], total: 1, page: 1, pageSize: 20 },
    );
    await expect(createAiSession(7).list(1, signal())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("does not expose history after the grant was revoked during its read", async () => {
    let reads = 0;
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      path === "/auth/me"
        ? ++reads === 1
          ? me
          : { ...me, permissionKeys: [] }
        : { ...item, messages: [] },
    );
    await expect(createAiSession(7).read(id, signal())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects a committed late create result without navigating under a newer session", async () => {
    vi.mocked(apiRequest).mockImplementation(async () => {
      identity.epoch++;
      return item;
    });
    await expect(createAiSession(7).create(signal())).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(apiRequest).toHaveBeenCalledOnce();
  });
  it("cancels the reader and emits no delta/completion after the session changes midstream", async () => {
    const cancelled = vi.fn();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(apiStreamRequest).mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            stream = c;
          },
          cancel: cancelled,
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
    );
    const delta = vi.fn();
    const pending = createAiSession(7).send(
      id,
      { clientRequestId: id, content: "test" },
      delta,
      signal(),
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(apiStreamRequest).toHaveBeenCalledOnce());
    identity.epoch++;
    stream.enqueue(
      new TextEncoder().encode('event: delta\ndata: {"text":"private"}\n\n'),
    );
    await rejected;
    expect(delta).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("does not return a persisted completion if the post-stream grant verification fails", async () => {
    const message = {
      messageId: "2",
      role: "assistant",
      content: "answer",
      status: "complete",
      createdAt: item.createdAt,
      citations: [],
    };
    vi.mocked(apiStreamRequest).mockResolvedValue(
      new Response(`event: completed\ndata: ${JSON.stringify(message)}\n\n`, {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.mocked(apiRequest).mockResolvedValue({ ...me, permissionKeys: [] });
    await expect(
      createAiSession(7).send(
        id,
        { clientRequestId: id, content: "test" },
        vi.fn(),
        signal(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("isolates list/detail cache keys across same-account logins", () => {
    expect(aiKeys.list(7, 4)).not.toEqual(aiKeys.list(7, 5));
    expect(aiKeys.detail(7, 4, id)).not.toEqual(aiKeys.detail(7, 5, id));
  });
});
