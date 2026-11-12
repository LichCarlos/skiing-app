import { apiRequest } from "../../platform/api/api-client";
import type { components } from "../../platform/api/openapi";
import { favoriteId } from "../favorites/favorites-api";
import { ApiError } from "../../platform/api/api-error";
import {
  validateArticleDetail,
  validateArticlePage,
} from "./article-list-validation";
import {
  sessionEpoch,
  assertSessionEpoch,
} from "../../platform/auth/secure-session";

type Article = components["schemas"]["PublicArticleDetailVO"];
type Page = components["schemas"]["PublicArticlePageVO"];
export const articleKeys = {
  detail: (userId: number | null, id: string) =>
    ["public-article", userId, id] as const,
  list: (userId: number | null) => ["public-articles", userId] as const,
  filteredList: (userId: number | null, query: URLSearchParams) =>
    ["public-articles", userId, query.toString()] as const,
};
function assertOpen(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("页面已关闭");
}
async function verify(
  userId: number,
  signal?: AbortSignal,
  expectedEpoch?: number,
) {
  assertOpen(signal);
  const me = await apiRequest<{ userId: number }>("/auth/me", {
    signal,
    cache: "no-store",
    ...(expectedEpoch === undefined
      ? {}
      : { expectedSessionEpoch: expectedEpoch }),
  });
  assertOpen(signal);
  if (me.userId !== userId)
    throw new ApiError("登录账号已变化，请重新打开文章。", {
      status: 403,
      code: null,
      traceId: null,
    });
}
export async function readArticle(
  id: string,
  userId: number | null,
  signal?: AbortSignal,
  expectedEpoch = sessionEpoch(),
): Promise<Article> {
  if (favoriteId(id) === null) throw new Error("文章编号无效");
  const check = () => {
    assertOpen(signal);
    assertSessionEpoch(expectedEpoch);
  };
  check();
  if (userId !== null) await verify(userId, signal, expectedEpoch);
  check();
  const article = await apiRequest<Article>(`/articles/${id}`, {
    signal,
    cache: "no-store",
    expectedSessionEpoch: expectedEpoch,
  });
  check();
  validateArticleDetail(article, Number(id));
  if (userId !== null) await verify(userId, signal, expectedEpoch);
  check();
  return userId === null ? { ...article, favoriteByMe: false } : article;
}
export async function readArticles(
  params: URLSearchParams,
  userId: number | null,
  signal?: AbortSignal,
  expectedEpoch?: number,
): Promise<Page> {
  assertOpen(signal);
  if (userId !== null) await verify(userId, signal, expectedEpoch);
  const page = await apiRequest<Page>(`/articles?${params}`, {
    signal,
    cache: "no-store",
    ...(expectedEpoch === undefined
      ? {}
      : { expectedSessionEpoch: expectedEpoch }),
  });
  assertOpen(signal);
  if (userId !== null) await verify(userId, signal, expectedEpoch);
  validateArticlePage(page, params);
  return userId === null
    ? {
        ...page,
        items: page.items.map((article) => ({
          ...article,
          favoriteByMe: false,
        })),
      }
    : page;
}
