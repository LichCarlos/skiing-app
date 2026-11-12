export function buildArticleQuery(
  keyword: string,
  categoryValue: string,
  page = 1,
): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, raw] of [
    ["keyword", keyword],
    ["categoryValue", categoryValue],
  ] as const) {
    const value = raw.trim();
    if (value.length > 100)
      throw new Error(
        key === "keyword"
          ? "关键词不能超过 100 字符"
          : "分类值不能超过 100 字符",
      );
    if (value) query.set(key, value);
  }
  if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * 12 > 2147483647)
    throw new Error("页码无效，请重新加载文章");
  query.set("page", String(page));
  query.set("pageSize", "12");
  return query;
}
