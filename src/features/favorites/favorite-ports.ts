import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../../platform/api/api-error";
import {
  assertSessionEpoch,
  sessionEpoch,
} from "../../platform/auth/secure-session";
import type { FavoriteRun } from "./favorite-run";
import {
  favoriteKeys,
  readFavoriteState,
  verifyFavoriteAccount,
  writeFavorite,
} from "./favorites-api";

/** Every cache operation belongs to one captured account/session, including lists. */
export function favoriteReadKeys(userId: number | null) {
  return [
    favoriteKeys.lists(userId),
    ["public-resort", userId],
    ["public-resorts", userId],
    ["public-article", userId],
    ["public-articles", userId],
  ] as const;
}
export async function cancelFavoriteReads(
  cache: QueryClient,
  userId: number | null,
) {
  await Promise.all(
    favoriteReadKeys(userId).map((queryKey) =>
      cache.cancelQueries({ queryKey }),
    ),
  );
}
export function createFavoritePorts(
  userId: number | null,
  cache: QueryClient,
  epoch: number,
): Omit<ConstructorParameters<typeof FavoriteRun>[0], "changed"> {
  const check = (signal: AbortSignal) => {
    signal.throwIfAborted();
    assertSessionEpoch(epoch);
  };
  return {
    verify: async (signal) => {
      check(signal);
      if (userId === null)
        throw new ApiError("请先登录", {
          status: 401,
          code: null,
          traceId: null,
        });
      await verifyFavoriteAccount(userId, signal, epoch);
      check(signal);
    },
    prepare: async (signal) => {
      check(signal);
      await cancelFavoriteReads(cache, userId);
      check(signal);
    },
    read: async (target, signal) => {
      check(signal);
      const value = await readFavoriteState(target, signal, epoch);
      check(signal);
      return value;
    },
    write: async (target, desired, signal) => {
      check(signal);
      await writeFavorite(target, desired, signal, epoch);
      check(signal);
    },
    reconciled: () => {
      assertSessionEpoch(epoch);
      void Promise.all(
        favoriteReadKeys(userId).map((queryKey) =>
          cache.invalidateQueries({
            queryKey,
            predicate: () => sessionEpoch() === epoch,
          }),
        ),
      ).catch(() => undefined);
    },
  };
}
