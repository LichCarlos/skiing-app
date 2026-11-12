import { describe, expect, it } from "vitest";
import { validateArticleDetail } from "./article-list-validation";
const article = {
  articleId: 11,
  title: "Snow",
  summary: "Summary",
  body: "Line one\nLine two",
  coverUrl: null,
  authorName: null,
  category: { value: "safety", label: "Safety" },
  publishTime: "2026-11-02T00:00:00Z",
  favoriteByMe: false,
};
describe("public article detail wire boundary", () => {
  it("accepts full detail including nullable author/cover and plain body", () => {
    expect(() => validateArticleDetail(article, 11)).not.toThrow();
    expect(() =>
      validateArticleDetail(
        {
          ...article,
          coverUrl: "https://example.test/cover",
          authorName: "Author",
        },
        11,
      ),
    ).not.toThrow();
  });
  it.each([
    null,
    [],
    {},
    { ...article, articleId: 12 },
    { ...article, articleId: "11" },
    { ...article, body: null },
    { ...article, body: undefined },
    { ...article, title: 5 },
    { ...article, summary: null },
    { ...article, coverUrl: undefined },
    { ...article, authorName: undefined },
    { ...article, category: null },
    { ...article, category: { value: " ", label: "Safety" } },
    { ...article, category: { value: "safety", label: "" } },
    { ...article, publishTime: "invalid" },
    { ...article, favoriteByMe: "false" },
  ])("rejects unsafe detail %j before display", (value) => {
    expect(() => validateArticleDetail(value, 11)).toThrow(TypeError);
  });
});
