import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../platform/api/api-client";
import { articleKeys, readArticle, readArticles } from "./article-api";
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => 0,
  assertSessionEpoch: vi.fn(),
}));
const request = vi.mocked(apiRequest);
afterEach(() => request.mockReset());
const article = {
  articleId: 11,
  favoriteByMe: true,
  title: "snow",
  summary: "safety",
  body: "雪场安全",
  coverUrl: null,
  category: { value: "safety", label: "Safety" },
  authorName: null,
  publishTime: "2026-11-02T00:00:00Z",
};
const summary = {
  ...article,
  title: "snow",
  summary: "safety",
  coverUrl: null,
  category: { value: "safety", label: "Safety" },
  authorName: null,
  publishTime: "2026-11-02T00:00:00Z",
};
const page = (pageSize = 20) => ({
  items: [summary],
  page: 1,
  pageSize,
  total: 1,
  hasNext: false,
});
describe("article reads and account isolation", () => {
  it("partitions article caches by account and target", () => {
    expect(articleKeys.detail(1, "11")).not.toEqual(
      articleKeys.detail(2, "11"),
    );
    expect(articleKeys.detail(1, "11")).not.toEqual(
      articleKeys.detail(1, "12"),
    );
    expect(articleKeys.list(null)).not.toEqual(articleKeys.list(1));
  });
  it("forces guest detail/list to false without a session lookup", async () => {
    request.mockResolvedValueOnce(article).mockResolvedValueOnce(page());
    expect((await readArticle("11", null)).favoriteByMe).toBe(false);
    expect(
      (await readArticles(new URLSearchParams(), null)).items[0]!.favoriteByMe,
    ).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each(["detail", "list"])(
    "checks identity before and after %s reads without requiring a favorite grant",
    async (mode) => {
      const result = mode === "detail" ? article : page(12);
      request
        .mockResolvedValueOnce({ userId: 7 })
        .mockResolvedValueOnce(result)
        .mockResolvedValueOnce({ userId: 7 });
      const signal = new AbortController().signal;
      expect(
        await (mode === "detail"
          ? readArticle("11", 7, signal)
          : readArticles(new URLSearchParams("page=1&pageSize=12"), 7, signal)),
      ).toBe(result);
      expect(request).toHaveBeenNthCalledWith(1, "/auth/me", {
        signal,
        cache: "no-store",
        ...(mode === "detail" ? { expectedSessionEpoch: 0 } : {}),
      });
      expect(request).toHaveBeenNthCalledWith(3, "/auth/me", {
        signal,
        cache: "no-store",
        ...(mode === "detail" ? { expectedSessionEpoch: 0 } : {}),
      });
    },
  );
  it.each(["detail", "list"])(
    "stops a changed %s identity before returning personalized data",
    async (mode) => {
      request
        .mockResolvedValueOnce({ userId: 7 })
        .mockResolvedValueOnce(
          mode === "detail" ? article : { items: [article] },
        )
        .mockResolvedValueOnce({ userId: 8 });
      await expect(
        mode === "detail"
          ? readArticle("11", 7)
          : readArticles(new URLSearchParams(), 7),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
  it("does not fetch an article for a different current account", async () => {
    request.mockResolvedValueOnce({ userId: 8 });
    await expect(readArticle("11", 7)).rejects.toMatchObject({ status: 403 });
    expect(request).toHaveBeenCalledOnce();
  });
  it.each([
    "0",
    "-1",
    "01",
    " 1",
    "1.1",
    "1e2",
    "2147483648",
    "9007199254740993",
    "11?userId=7",
  ])("rejects invalid ID %s before fetching", async (id) => {
    await expect(readArticle(id, 7)).rejects.toThrow("编号");
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    { articleId: 12, favoriteByMe: true },
    { articleId: 11 },
    { articleId: 11, favoriteByMe: "false" },
  ])("rejects mismatched detail %j", async (response) => {
    request.mockResolvedValueOnce(response);
    await expect(readArticle("11", null)).rejects.toThrow("无效");
  });
  it.each(["detail", "list"])(
    "does not start %s reads for a closed screen",
    async (mode) => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        mode === "detail"
          ? readArticle("11", 7, controller.signal)
          : readArticles(new URLSearchParams(), 7, controller.signal),
      ).rejects.toThrow("关闭");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it.each(["identity", "detail", "list", "final-identity"])(
    "rejects late %s responses after screen cancellation",
    async (stage) => {
      const controller = new AbortController();
      if (stage === "final-identity")
        request
          .mockResolvedValueOnce({ userId: 7 })
          .mockResolvedValueOnce(article);
      request.mockImplementationOnce(async () => {
        controller.abort();
        return stage === "identity" || stage === "final-identity"
          ? { userId: 7 }
          : stage === "detail"
            ? article
            : { items: [article] };
      });
      await expect(
        stage === "list"
          ? readArticles(new URLSearchParams(), null, controller.signal)
          : readArticle(
              "11",
              stage === "identity" || stage === "final-identity" ? 7 : null,
              controller.signal,
            ),
      ).rejects.toThrow("关闭");
    },
  );
});
