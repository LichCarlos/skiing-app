import { contentMetadataValid } from "../content/markdown-model";
import type { components } from "../../platform/api/openapi";

type Category = components["schemas"]["PublicArticleCategoryVO"];
type Page = components["schemas"]["PublicArticlePageVO"];
type Detail = components["schemas"]["PublicArticleDetailVO"];
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function category(value: unknown): value is Category {
  return (
    object(value) &&
    typeof value.value === "string" &&
    !!value.value.trim() &&
    typeof value.label === "string" &&
    !!value.label.trim()
  );
}
function articleSummary(item: unknown): boolean {
  return (
    object(item) &&
    Number.isInteger(item.articleId) &&
    Number(item.articleId) >= 1 &&
    Number(item.articleId) <= 2147483647 &&
    typeof item.title === "string" &&
    typeof item.summary === "string" &&
    typeof item.favoriteByMe === "boolean" &&
    (item.coverUrl === null || typeof item.coverUrl === "string") &&
    (item.authorName === null || typeof item.authorName === "string") &&
    category(item.category) &&
    typeof item.publishTime === "string" &&
    Number.isFinite(Date.parse(item.publishTime))
  );
}
export function validateArticleCategories(
  value: unknown,
): asserts value is Category[] {
  if (
    !Array.isArray(value) ||
    !value.every(category) ||
    new Set(value.map((item) => item.value)).size !== value.length
  )
    throw new TypeError("文章分类响应无效，请重试");
}
export function validateArticleDetail(
  value: unknown,
  expectedId: number,
): asserts value is Detail {
  if (
    !articleSummary(value) ||
    !object(value) ||
    value.articleId !== expectedId ||
    typeof value.body !== "string" ||
    value.body.length > 100000 ||
    !contentMetadataValid(value)
  )
    throw new TypeError("文章详情响应无效，请重新加载");
}
export function validateArticlePage(
  value: unknown,
  params: URLSearchParams,
): asserts value is Page {
  const page = Number(params.get("page") ?? 1),
    pageSize = Number(params.get("pageSize") ?? 20);
  if (
    !object(value) ||
    value.page !== page ||
    value.pageSize !== pageSize ||
    !Number.isSafeInteger(value.total) ||
    Number(value.total) < 0 ||
    typeof value.hasNext !== "boolean" ||
    value.hasNext !== page * pageSize < Number(value.total) ||
    !Array.isArray(value.items) ||
    value.items.length !==
      Math.min(
        pageSize,
        Math.max(0, Number(value.total) - (page - 1) * pageSize),
      ) ||
    !value.items.every(articleSummary) ||
    new Set(value.items.map((item: { articleId: number }) => item.articleId))
      .size !== value.items.length
  )
    throw new TypeError("文章分页响应无效，请重新加载");
}
