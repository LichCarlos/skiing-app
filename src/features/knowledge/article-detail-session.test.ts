import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ epoch: 8 }));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => identity.epoch,
  assertSessionEpoch: (expected: number) => {
    if (expected !== identity.epoch) throw new Error("session changed");
  },
}));
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../platform/api/api-client";
import { createArticleDetailSession } from "./article-detail-session";
const request = vi.mocked(apiRequest);
const article = {
  articleId: 11,
  title: "Snow",
  summary: "Summary",
  body: "SYNTHETIC-BODY",
  coverUrl: null,
  authorName: null,
  category: { value: "safety", label: "Safety" },
  publishTime: "2026-11-02T00:00:00Z",
  favoriteByMe: true,
};
const signal = () => new AbortController().signal;
beforeEach(() => {
  identity.epoch = 8;
});
afterEach(() => request.mockReset());
describe("article detail captured login", () => {
  it("binds both identity checks and detail to the same epoch without requiring a write grant", async () => {
    request
      .mockResolvedValueOnce({ userId: 7 })
      .mockResolvedValueOnce(article)
      .mockResolvedValueOnce({ userId: 7 });
    const s = signal();
    await expect(createArticleDetailSession(7, "11").read(s)).resolves.toBe(
      article,
    );
    expect(request.mock.calls.map((c) => c[0])).toEqual([
      "/auth/me",
      "/articles/11",
      "/auth/me",
    ]);
    for (const [, options] of request.mock.calls)
      expect(options).toEqual({
        signal: s,
        cache: "no-store",
        expectedSessionEpoch: 8,
      });
  });
  it("returns a guest projection with no identity lookup", async () => {
    request.mockResolvedValue(article);
    await expect(
      createArticleDetailSession(null, "11").read(signal()),
    ).resolves.toMatchObject({ favoriteByMe: false, body: article.body });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([null, 7])(
    "rejects a stale login before fetching even for identity %s",
    async (userId) => {
      const session = createArticleDetailSession(userId, "11");
      identity.epoch++;
      await expect(session.read(signal())).rejects.toThrow("session");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it.each([1, 2, 3])(
    "stops after checkpoint %s when the same account logs in again",
    async (checkpoint) => {
      let calls = 0;
      request.mockImplementation(async (path) => {
        if (++calls === checkpoint) identity.epoch++;
        return path === "/auth/me" ? { userId: 7 } : article;
      });
      await expect(
        createArticleDetailSession(7, "11").read(signal()),
      ).rejects.toThrow("session");
      expect(request).toHaveBeenCalledTimes(checkpoint);
    },
  );
  it.each(["before", "after"])(
    "rejects another account %s reading",
    async (stage) => {
      if (stage === "after")
        request
          .mockResolvedValueOnce({ userId: 7 })
          .mockResolvedValueOnce(article);
      request.mockResolvedValueOnce({ userId: 9 });
      await expect(
        createArticleDetailSession(7, "11").read(signal()),
      ).rejects.toMatchObject({ status: 403 });
      expect(request).toHaveBeenCalledTimes(stage === "after" ? 3 : 1);
    },
  );
  it.each([undefined, ["11"], ["11", "12"], "01", "2147483648"])(
    "does not request an invalid route %j",
    async (raw) => {
      const session = createArticleDetailSession(7, raw);
      expect(session.id).toBeNull();
      await expect(session.read(signal())).rejects.toThrow("编号");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("rejects cancellation before request and between identity and detail", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createArticleDetailSession(7, "11").read(controller.signal),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    const later = new AbortController();
    request.mockImplementationOnce(async () => {
      later.abort();
      return { userId: 7 };
    });
    await expect(
      createArticleDetailSession(7, "11").read(later.signal),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("partitions cached detail by target and epoch while preserving account invalidation", () => {
    const a = createArticleDetailSession(7, "11");
    expect(a.key.slice(0, 2)).toEqual(["public-article", 7]);
    expect(a.key).not.toEqual(createArticleDetailSession(7, "12").key);
    identity.epoch++;
    expect(a.key).not.toEqual(createArticleDetailSession(7, "11").key);
    expect(a.key).not.toEqual(createArticleDetailSession(8, "11").key);
  });
});
