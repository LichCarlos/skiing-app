import type { FavoriteFilter, FavoritePage } from "./favorites-api";
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const nullableText = (v: unknown) => v === null || text(v);
const date = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
function item(v: unknown, filter: FavoriteFilter) {
  if (
    !object(v) ||
    !text(v.favoriteId) ||
    !/^[1-9]\d*$/.test(v.favoriteId) ||
    !date(v.favoritedAt) ||
    !["resort", "article"].includes(String(v.targetType)) ||
    (filter !== "all" && v.targetType !== filter) ||
    !object(v.target)
  )
    return false;
  const t = v.target;
  if (
    t.targetType !== v.targetType ||
    !Number.isSafeInteger(t.id) ||
    Number(t.id) < 1 ||
    Number(t.id) > 2147483647
  )
    return false;
  if (t.targetType === "resort")
    return (
      text(t.name) &&
      [t.province, t.city, t.district].every(nullableText) &&
      (t.rating === null ||
        (typeof t.rating === "number" &&
          Number.isFinite(t.rating) &&
          t.rating >= 0 &&
          t.rating <= 5)) &&
      text(t.startingPrice) &&
      /^\d+(?:\.\d+)?$/.test(t.startingPrice)
    );
  return (
    text(t.title) && text(t.summary) && text(t.category) && date(t.publishedAt)
  );
}
export function validateFavoritePage(
  value: unknown,
  page: number,
  filter: FavoriteFilter,
): asserts value is FavoritePage {
  if (
    !object(value) ||
    value.page !== page ||
    value.pageSize !== 20 ||
    !Number.isSafeInteger(value.total) ||
    Number(value.total) < 0 ||
    !Array.isArray(value.items) ||
    value.items.length !==
      Math.min(20, Math.max(0, Number(value.total) - (page - 1) * 20)) ||
    !value.items.every((v) => item(v, filter)) ||
    new Set(value.items.map((v) => v.favoriteId)).size !== value.items.length ||
    new Set(value.items.map((v) => `${v.targetType}:${v.target.id}`)).size !==
      value.items.length
  )
    throw new TypeError("收藏分页响应不符，请重新加载");
}
