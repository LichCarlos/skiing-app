import { apiRequest } from "../../platform/api/api-client";
import { ApiError } from "../../platform/api/api-error";
import type { components } from "../../platform/api/openapi";

import {
  assertSessionEpoch,
  sessionEpoch,
} from "../../platform/auth/secure-session";
import { validateResortDetail } from "../resorts/resort-detail-validation";
import { validateFavoritePage } from "./favorites-validation";

function check(signal: AbortSignal, epoch: number) {
  signal.throwIfAborted();
  assertSessionEpoch(epoch);
}

type ApiFavoriteItem = components["schemas"]["FavoriteItemVO"];
// This client requests only the two legacy favorite kinds and validates them.
export type FavoriteItem = Omit<ApiFavoriteItem, "target"> & {
  target: Exclude<ApiFavoriteItem["target"], { targetType: "dynamic" }>;
};
export type FavoritePage = Omit<
  components["schemas"]["FavoritePageVO"],
  "items"
> & {
  items: FavoriteItem[];
};
export type FavoriteTarget = components["schemas"]["FavoriteTargetDto"];
export type FavoriteFilter = "all" | FavoriteTarget["targetType"];
export type ResortDetail = components["schemas"]["PublicResortDetailVO"];
export function favoriteId(input: unknown): number | null {
  if (typeof input !== "string" || !/^[1-9]\d*$/.test(input)) return null;
  const id = Number(input);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
export function assertFavoriteTarget(target: FavoriteTarget) {
  if (
    !["resort", "article"].includes(target.targetType) ||
    !Number.isSafeInteger(target.targetId) ||
    target.targetId < 1 ||
    target.targetId > 2147483647
  )
    throw new Error("收藏目标无效");
}
export async function verifyFavoriteAccount(
  userId: number,
  signal: AbortSignal,
  expectedEpoch = sessionEpoch(),
) {
  check(signal, expectedEpoch);
  const me = await apiRequest<components["schemas"]["CurrentUserVO"]>(
    "/auth/me",
    { signal, cache: "no-store", expectedSessionEpoch: expectedEpoch },
  );
  check(signal, expectedEpoch);
  if (
    me.userId !== userId ||
    !me.permissionKeys.includes("member:favorite:toggle")
  )
    throw new ApiError("收藏账号或权限已变化", {
      status: 403,
      code: null,
      traceId: null,
    });
}
export async function listFavorites(
  page: number,
  filter: FavoriteFilter,
  signal: AbortSignal,
  expectedEpoch = sessionEpoch(),
) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    (page - 1) * 20 > 2147483647 ||
    !["all", "resort", "article"].includes(filter)
  )
    throw new Error("收藏分页或筛选无效");
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (filter !== "all") params.set("targetType", filter);
  check(signal, expectedEpoch);
  const value = await apiRequest<FavoritePage>(`/me/favorites?${params}`, {
    signal,
    cache: "no-store",
    expectedSessionEpoch: expectedEpoch,
  });
  check(signal, expectedEpoch);
  validateFavoritePage(value, page, filter);
  return value;
}
export async function readFavoriteState(
  target: FavoriteTarget,
  signal: AbortSignal,
  expectedEpoch = sessionEpoch(),
) {
  assertFavoriteTarget(target);
  check(signal, expectedEpoch);
  const value = await apiRequest<{
    favoriteByMe: boolean;
    resortId?: number;
    articleId?: number;
  }>(
    `/${target.targetType === "resort" ? "resorts" : "articles"}/${target.targetId}`,
    { signal, cache: "no-store", expectedSessionEpoch: expectedEpoch },
  );
  check(signal, expectedEpoch);
  if (
    typeof value.favoriteByMe !== "boolean" ||
    (target.targetType === "resort" ? value.resortId : value.articleId) !==
      target.targetId
  )
    throw new Error("收藏状态响应无效");
  return value.favoriteByMe;
}
export function writeFavorite(
  target: FavoriteTarget,
  desired: boolean,
  signal: AbortSignal,
  expectedEpoch = sessionEpoch(),
) {
  assertFavoriteTarget(target);
  check(signal, expectedEpoch);
  return apiRequest<void>(
    desired
      ? "/me/favorites"
      : `/me/favorites/${target.targetType}/${target.targetId}`,
    {
      method: desired ? "PUT" : "DELETE",
      ...(desired
        ? { body: { targetType: target.targetType, targetId: target.targetId } }
        : {}),
      signal,
      expectedSessionEpoch: expectedEpoch,
    },
  );
}
export async function readResortDetail(
  id: number,
  userId: number | null,
  signal: AbortSignal,
  expectedEpoch = sessionEpoch(),
): Promise<ResortDetail> {
  assertFavoriteTarget({ targetType: "resort", targetId: id });
  check(signal, expectedEpoch);
  async function verify() {
    if (userId === null) return;
    const me = await apiRequest<{ userId: number }>("/auth/me", {
      signal,
      cache: "no-store",
      expectedSessionEpoch: expectedEpoch,
    });
    check(signal, expectedEpoch);
    if (me.userId !== userId)
      throw new ApiError("雪场读取账号已变化", {
        status: 403,
        code: null,
        traceId: null,
      });
  }
  await verify();
  check(signal, expectedEpoch);
  const value = await apiRequest<ResortDetail>(`/resorts/${id}`, {
    signal,
    cache: "no-store",
    expectedSessionEpoch: expectedEpoch,
  });
  check(signal, expectedEpoch);
  validateResortDetail(value, id);
  await verify();
  check(signal, expectedEpoch);
  return userId === null ? { ...value, favoriteByMe: false } : value;
}
export const favoriteKeys = {
  lists: (userId: number | null) => ["member-favorites", userId] as const,
  list: (userId: number, filter: FavoriteFilter) =>
    ["member-favorites", userId, filter] as const,
  resort: (userId: number | null, id: number) =>
    ["public-resort", userId, id] as const,
};
