import { describe, expect, it } from "vitest";
import {
  validateArticleCategories,
  validateArticlePage,
} from "./article-list-validation";
import { buildArticleQuery } from "./article-query";
const item = {
  articleId: 11,
  title: "滑雪",
  summary: "safety",
  coverUrl: null,
  authorName: null,
  publishTime: "2026-11-02T00:00:00Z",
  category: { value: "safety", label: "安全" },
  favoriteByMe: false,
};
const page = { items: [item], page: 1, pageSize: 12, total: 1, hasNext: false };
describe("knowledge list response boundaries", () => {
  it("accepts optional author and cover null, empty pages beyond the end, and exact offset totals", () => {
    validateArticlePage(page, buildArticleQuery("", ""));
    validateArticlePage(
      { ...page, items: [], page: 3 },
      buildArticleQuery("", "", 3),
    );
    validateArticleCategories([]);
    validateArticleCategories([item.category]);
  });
  it.each([
    null,
    {},
    { ...page, page: 2 },
    { ...page, pageSize: 20 },
    { ...page, total: -1 },
    { ...page, total: 1.5 },
    { ...page, hasNext: true },
    { ...page, items: null },
    { ...page, total: 2 },
    { ...page, items: [item, item], total: 2 },
  ])("rejects malformed pagination %j", (value) =>
    expect(() => validateArticlePage(value, buildArticleQuery("", ""))).toThrow(
      TypeError,
    ),
  );
  it.each([
    { articleId: 0 },
    { articleId: 2147483648 },
    { title: null },
    { summary: null },
    { coverUrl: 12 },
    { authorName: 7 },
    { publishTime: "invalid" },
    { category: null },
    { category: { value: "", label: "x" } },
    { favoriteByMe: "false" },
  ])("rejects malformed cards %j", (change) =>
    expect(() =>
      validateArticlePage(
        { ...page, items: [{ ...item, ...change }] },
        buildArticleQuery("", ""),
      ),
    ).toThrow(TypeError),
  );
  it.each([
    null,
    {},
    [null],
    [{ value: "", label: "x" }],
    [{ value: "x", label: " " }],
    [item.category, item.category],
  ])("rejects malformed categories %j", (value) =>
    expect(() => validateArticleCategories(value)).toThrow(TypeError),
  );
});
