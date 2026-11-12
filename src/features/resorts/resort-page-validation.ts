import type { components } from "../../platform/api/openapi";

export function validateResortPage(
  page: components["schemas"]["PublicResortPageVO"],
  query: URLSearchParams,
) {
  if (
    !page ||
    page.page !== Number(query.get("page")) ||
    page.pageSize !== Number(query.get("pageSize")) ||
    !Number.isSafeInteger(page.total) ||
    page.total < 0 ||
    typeof page.hasNext !== "boolean" ||
    !Array.isArray(page.items) ||
    page.items.length > page.pageSize ||
    page.items.length > page.total ||
    page.items.some(
      (item) =>
        !item ||
        !Number.isSafeInteger(item.resortId) ||
        item.resortId <= 0 ||
        item.resortId > 2147483647 ||
        typeof item.favoriteByMe !== "boolean",
    ) ||
    new Set(page.items.map((item) => item.resortId)).size !== page.items.length
  )
    throw new Error("雪场分页响应无效，请重新加载");
  return page;
}
