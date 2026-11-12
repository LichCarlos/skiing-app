export function assertCommunityId(id: number) {
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)
    throw new Error("动态或评论编号无效");
}
export function communityFeedParams(input: {
  cursor?: string | null;
  keyword?: string;
  limit?: number;
}) {
  const limit = input.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("动态分页数量无效");
  if ((input.keyword?.length ?? 0) > 200)
    throw new Error("搜索词不能超过 200 字符");
  if (
    input.cursor !== undefined &&
    input.cursor !== null &&
    (!/^[A-Za-z0-9_-]+$/.test(input.cursor) || input.cursor.length > 512)
  )
    throw new Error("动态游标无效，请重新加载列表");
  const params = new URLSearchParams({ limit: String(limit) });
  if (input.keyword?.trim()) params.set("keyword", input.keyword.trim());
  if (input.cursor) params.set("cursor", input.cursor);
  return params;
}
export const communityKeys = {
  feeds: (userId: number | null) => ["community-dynamics", userId] as const,
  feed: (userId: number | null, keyword: string) =>
    ["community-dynamics", userId, { keyword: keyword.trim() }] as const,
  detail: (id: number, userId: number | null) =>
    ["community-dynamic", id, userId] as const,
};
