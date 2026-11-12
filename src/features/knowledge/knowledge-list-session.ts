import { apiRequest } from "../../platform/api/api-client";
import {
  assertSessionEpoch,
  sessionEpoch,
} from "../../platform/auth/secure-session";
import { readArticles } from "./article-api";
import { buildArticleQuery } from "./article-query";
import { validateArticleCategories } from "./article-list-validation";

export const knowledgeListKeys = {
  lists: (userId: number | null, epoch: number) =>
    ["public-articles", userId, epoch] as const,
  categories: (userId: number | null, epoch: number) =>
    ["public-article-categories", userId, epoch] as const,
};
export function knowledgeIdentityKey(
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
export function createKnowledgeListSession(
  userId: number | null,
  epoch = sessionEpoch(),
) {
  const check = (signal: AbortSignal) => {
    signal.throwIfAborted();
    assertSessionEpoch(epoch);
  };
  return {
    epoch,
    async categories(signal: AbortSignal) {
      check(signal);
      const result = await apiRequest<unknown>("/knowledge/categories", {
        signal,
        cache: "no-store",
        expectedSessionEpoch: epoch,
      });
      check(signal);
      validateArticleCategories(result);
      return result;
    },
    async list(
      keyword: string,
      category: string,
      page: number,
      signal: AbortSignal,
    ) {
      const params = buildArticleQuery(keyword, category, page);
      check(signal);
      const result = await readArticles(params, userId, signal, epoch);
      check(signal);
      return result;
    },
  };
}
