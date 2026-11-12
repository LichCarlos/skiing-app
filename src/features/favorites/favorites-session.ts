import {
  sessionEpoch,
  assertSessionEpoch,
} from "../../platform/auth/secure-session";
import {
  favoriteId,
  favoriteKeys,
  listFavorites,
  readResortDetail,
  type FavoriteFilter,
} from "./favorites-api";

export function favoriteIdentityKey(
  user: { userId: number; account: string; permissionKeys: string[] } | null,
  status: string,
  epoch = sessionEpoch(),
) {
  return JSON.stringify([
    user?.userId ?? null,
    user?.account ?? null,
    [...(user?.permissionKeys ?? [])].sort(),
    status,
    epoch,
  ]);
}
export function createResortDetailSession(
  userId: number | null,
  rawId: unknown,
  epoch = sessionEpoch(),
) {
  const id = favoriteId(rawId);
  return {
    epoch,
    id,
    key: [...favoriteKeys.resort(userId, id ?? 0), epoch] as const,
    async read(signal: AbortSignal) {
      signal.throwIfAborted();
      assertSessionEpoch(epoch);
      if (id === null) throw new Error("雪场编号无效");
      return readResortDetail(id, userId, signal, epoch);
    },
  };
}
export function createFavoritesSession(
  userId: number | null,
  epoch = sessionEpoch(),
) {
  return {
    epoch,
    key: [...favoriteKeys.lists(userId), epoch] as const,
    async list(page: number, filter: FavoriteFilter, signal: AbortSignal) {
      signal.throwIfAborted();
      assertSessionEpoch(epoch);
      if (userId === null) throw new Error("请先登录");
      return listFavorites(page, filter, signal, epoch);
    },
  };
}
