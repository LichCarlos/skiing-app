import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ epoch: 4 }));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => boundary.epoch,
  assertSessionEpoch: (expected: number) => {
    if (expected !== boundary.epoch) throw new Error("session changed");
  },
}));
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../platform/api/api-client";
import {
  createKnowledgeListSession,
  knowledgeListKeys,
  knowledgeIdentityKey,
} from "./knowledge-list-session";
const request = vi.mocked(apiRequest);
const item = {
  articleId: 11,
  title: "snow",
  summary: "safety",
  coverUrl: null,
  category: { value: "a", label: "A" },
  authorName: null,
  publishTime: "2026-11-02T00:00:00Z",
  favoriteByMe: true,
};
const page = { items: [item], page: 1, pageSize: 12, total: 1, hasNext: false };
const signal = () => new AbortController().signal;
beforeEach(() => {
  boundary.epoch = 4;
});
afterEach(() => request.mockReset());
describe("knowledge list captured login", () => {
  it("binds every identity and page request to the same epoch", async () => {
    request
      .mockResolvedValueOnce({ userId: 7 })
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ userId: 7 });
    const s = signal();
    expect(
      await createKnowledgeListSession(7).list(" snow ", " a ", 1, s),
    ).toBe(page);
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "/auth/me",
      "/articles?keyword=snow&categoryValue=a&page=1&pageSize=12",
      "/auth/me",
    ]);
    for (const call of request.mock.calls)
      expect(call[1]).toMatchObject({
        signal: s,
        expectedSessionEpoch: 4,
        cache: "no-store",
      });
  });
  it("forces guest favorites false and validates categories without an identity call", async () => {
    request.mockResolvedValueOnce(page).mockResolvedValueOnce([item.category]);
    const session = createKnowledgeListSession(null);
    expect(
      (await session.list("", "", 1, signal())).items[0]!.favoriteByMe,
    ).toBe(false);
    expect(await session.categories(signal())).toEqual([item.category]);
    expect(request.mock.calls.map((c) => c[0])).toEqual([
      "/articles?page=1&pageSize=12",
      "/knowledge/categories",
    ]);
  });
  it.each(["list", "categories"])(
    "rejects %s before fetch after even same-account relogin",
    async (mode) => {
      const session = createKnowledgeListSession(7);
      boundary.epoch++;
      await expect(
        mode === "list"
          ? session.list("", "", 1, signal())
          : session.categories(signal()),
      ).rejects.toThrow("session");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it.each(["list", "categories"])(
    "rejects late %s output after epoch changes",
    async (mode) => {
      const session = createKnowledgeListSession(null);
      request.mockImplementationOnce(async () => {
        boundary.epoch++;
        return mode === "list" ? page : [item.category];
      });
      await expect(
        mode === "list"
          ? session.list("", "", 1, signal())
          : session.categories(signal()),
      ).rejects.toThrow("session");
    },
  );
  it("rejects revoked identity after reading without emitting personalized results", async () => {
    request
      .mockResolvedValueOnce({ userId: 7 })
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ userId: 8 });
    await expect(
      createKnowledgeListSession(7).list("", "", 1, signal()),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("cancels category reads and rejects malformed category data", async () => {
    const controller = new AbortController();
    request.mockImplementationOnce(async () => {
      controller.abort();
      return [item.category];
    });
    await expect(
      createKnowledgeListSession(null).categories(controller.signal),
    ).rejects.toThrow();
    request.mockResolvedValueOnce([item.category, item.category]);
    await expect(
      createKnowledgeListSession(null).categories(signal()),
    ).rejects.toThrow(TypeError);
  });
  it("does not query invalid filters or unsafe offsets", async () => {
    const session = createKnowledgeListSession(7);
    await expect(
      session.list("x".repeat(101), "", 1, signal()),
    ).rejects.toThrow();
    await expect(session.list("", "", 178956972, signal())).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("keeps favorite invalidation prefixes while partitioning epoch/account and grant changes", () => {
    expect(knowledgeListKeys.lists(7, 4).slice(0, 2)).toEqual([
      "public-articles",
      7,
    ]);
    expect(knowledgeListKeys.lists(7, 4)).not.toEqual(
      knowledgeListKeys.lists(7, 5),
    );
    expect(knowledgeListKeys.categories(7, 4)).not.toEqual(
      knowledgeListKeys.categories(8, 4),
    );
    const user = { userId: 7, account: "snow", permissionKeys: ["a", "b"] };
    expect(knowledgeIdentityKey(user, 4)).toBe(
      knowledgeIdentityKey({ ...user, permissionKeys: ["b", "a"] }, 4),
    );
    expect(knowledgeIdentityKey(user, 4)).not.toBe(
      knowledgeIdentityKey({ ...user, permissionKeys: ["a"] }, 4),
    );
    expect(knowledgeIdentityKey(user, 4)).not.toBe(
      knowledgeIdentityKey(user, 5),
    );
  });
});
