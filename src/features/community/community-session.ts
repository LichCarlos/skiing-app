import { apiRequest } from "../../platform/api/api-client";
import { ApiError } from "../../platform/api/api-error";
import type { components } from "../../platform/api/openapi";
import {
  assertSessionEpoch,
  sessionEpoch,
} from "../../platform/auth/secure-session";
import { assertCommunityId, communityFeedParams } from "./community-query";
import type { CommentPage, DynamicDetail, DynamicFeed } from "./community-api";
import {
  validateCommentMutation,
  validateCommentPage,
  validateDynamicDetail,
  validateDynamicFeed,
  validateLikeState,
} from "./community-validation";

export type CommunityAction = "like" | "comment" | "delete-dynamic";
export const communitySessionKeys = {
  feeds: (userId: number | null, epoch: number) =>
    ["community-dynamics", userId, epoch] as const,
  feed: (userId: number | null, epoch: number, keyword: string) =>
    ["community-dynamics", userId, epoch, { keyword }] as const,
  detail: (id: number, userId: number | null, epoch: number) =>
    ["community-dynamic", id, userId, epoch] as const,
  comments: (id: number, userId: number | null, epoch: number) =>
    ["community-comments", id, userId, epoch] as const,
};
const permissions: Record<CommunityAction, string> = {
  like: "community:like:toggle",
  comment: "community:comment:create",
  "delete-dynamic": "community:dynamic:update-own",
};
export function communityIdentityKey(
  user: { userId: number; account: string; permissionKeys: string[] } | null,
  epoch: number,
) {
  return JSON.stringify([
    user?.userId ?? null,
    user?.account ?? null,
    [...(user?.permissionKeys ?? [])].sort(),
    epoch,
  ]);
}
/** One captured login, including guests. Never recapture credentials between awaits. */
export function createCommunitySession(
  userId: number | null,
  epoch = sessionEpoch(),
) {
  const check = (signal: AbortSignal) => {
    signal.throwIfAborted();
    assertSessionEpoch(epoch);
  };
  const request = async <T>(
    path: string,
    signal: AbortSignal,
    options: { method?: string; body?: unknown } = {},
  ) => {
    check(signal);
    const value = await apiRequest<T>(path, {
      ...options,
      signal,
      cache: "no-store",
      expectedSessionEpoch: epoch,
    });
    check(signal);
    return value;
  };
  const verify = async (signal: AbortSignal, action?: CommunityAction) => {
    check(signal);
    if (userId === null) {
      if (action)
        throw new ApiError("请先登录", {
          status: 401,
          code: null,
          traceId: null,
        });
      return { userId: null };
    }
    const me = await request<components["schemas"]["CurrentUserVO"]>(
      "/auth/me",
      signal,
    );
    if (
      me.userId !== userId ||
      (action && !me.permissionKeys.includes(permissions[action]))
    )
      throw new ApiError("社区账号或权限已变化", {
        status: 403,
        code: null,
        traceId: null,
      });
    return me;
  };
  const readDetail = async (id: number, signal: AbortSignal) => {
    assertCommunityId(id);
    await verify(signal);
    const value = await request<DynamicDetail>(`/dynamics/${id}`, signal);
    validateDynamicDetail(value, id);
    await verify(signal);
    return userId === null ? { ...value, likedByMe: false } : value;
  };
  return {
    epoch,
    verify,
    check,
    readDetail,
    async feed(keyword: string, cursor: string | null, signal: AbortSignal) {
      const params = communityFeedParams({ keyword, cursor });
      await verify(signal);
      const value = await request<DynamicFeed>(`/dynamics?${params}`, signal);
      validateDynamicFeed(value);
      if (cursor !== null && value.nextCursor === cursor)
        throw new TypeError("Repeated community cursor");
      await verify(signal);
      return userId === null
        ? {
            ...value,
            items: value.items.map((item) => ({ ...item, likedByMe: false })),
          }
        : value;
    },
    async comments(id: number, page: number, signal: AbortSignal) {
      assertCommunityId(id);
      if (!Number.isInteger(page) || page < 1 || (page - 1) * 20 > 2147483647)
        throw new TypeError("Invalid comment page");
      await verify(signal);
      const value = await request<CommentPage>(
        `/dynamics/${id}/comments?page=${page}&pageSize=20`,
        signal,
      );
      validateCommentPage(value, page);
      await verify(signal);
      return value;
    },
    async toggleLike(
      id: number,
      signal: AbortSignal,
      attempted: () => void = () => {},
    ) {
      await verify(signal, "like");
      const latest = await readDetail(id, signal);
      await verify(signal, "like");
      const liked = !latest.likedByMe;
      attempted();
      const value = await request<components["schemas"]["LikeStateVO"]>(
        `/dynamics/${id}/like`,
        signal,
        { method: liked ? "PUT" : "DELETE" },
      );
      validateLikeState(value, liked);
      return value;
    },
    async comment(
      id: number,
      content: string,
      signal: AbortSignal,
      attempted: () => void = () => {},
    ) {
      assertCommunityId(id);
      const text = content.trim();
      if (!text || Array.from(text).length > 2000)
        throw new TypeError("Invalid comment content");
      await verify(signal, "comment");
      attempted();
      const value = await request<components["schemas"]["CommentMutationVO"]>(
        `/dynamics/${id}/comments`,
        signal,
        { method: "POST", body: { content: text } },
      );
      validateCommentMutation(value);
      return value;
    },
    async remove(
      id: number,
      kind: "dynamic" | "comment",
      signal: AbortSignal,
      attempted: () => void = () => {},
    ) {
      assertCommunityId(id);
      await verify(signal, kind === "dynamic" ? "delete-dynamic" : "comment");
      if (kind === "dynamic") {
        const latest = await readDetail(id, signal);
        if (latest.author.userId !== userId)
          throw new ApiError("只能删除本人动态", {
            status: 403,
            code: null,
            traceId: null,
          });
      }
      attempted();
      await request<void>(
        `/${kind === "dynamic" ? "dynamics" : "comments"}/${id}`,
        signal,
        { method: "DELETE" },
      );
    },
  };
}
