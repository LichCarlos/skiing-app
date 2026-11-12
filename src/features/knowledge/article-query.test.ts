import { describe, expect, it, vi } from "vitest";
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => 0,
  assertSessionEpoch: vi.fn(),
}));
import { buildArticleQuery } from "./article-query";
import { articleKeys } from "./article-api";

describe("Knowledge list query and cache partitions", () => {
  it("normalizes and encodes literal keywords and category with the confirmed page size", () => {
    const params = buildArticleQuery(" 雪 & %_ ", " a&b ", 2);
    expect(Object.fromEntries(params)).toEqual({
      keyword: "雪 & %_",
      categoryValue: "a&b",
      page: "2",
      pageSize: "12",
    });
    expect(new URLSearchParams(params.toString()).get("keyword")).toBe(
      "雪 & %_",
    );
  });
  it.each([0, -1, 1.5, NaN, Infinity, 178956972, Number.MAX_SAFE_INTEGER])(
    "rejects unsafe page %s",
    (page) => {
      expect(() => buildArticleQuery("", "", page)).toThrow("页码");
    },
  );
  it.each([
    ["x".repeat(101), ""],
    ["", "x".repeat(101)],
  ])(
    "rejects values outside the backend input contract",
    (keyword, category) => {
      expect(() => buildArticleQuery(keyword, category)).toThrow("100");
    },
  );
  it("partitions both account and effective filters while retaining favorite invalidation prefixes", () => {
    const current = articleKeys.filteredList(
      7,
      buildArticleQuery("snow", "safety"),
    );
    expect(current.slice(0, 2)).toEqual(articleKeys.list(7));
    expect(current).not.toEqual(
      articleKeys.filteredList(8, buildArticleQuery("snow", "safety")),
    );
    expect(current).not.toEqual(
      articleKeys.filteredList(7, buildArticleQuery("snow", "equipment")),
    );
    expect(current).not.toEqual(
      articleKeys.filteredList(7, buildArticleQuery("ice", "safety")),
    );
    expect(current).toEqual(
      articleKeys.filteredList(7, buildArticleQuery(" snow ", "safety")),
    );
    expect(current).not.toEqual(
      articleKeys.filteredList(null, buildArticleQuery("snow", "safety")),
    );
  });
});
