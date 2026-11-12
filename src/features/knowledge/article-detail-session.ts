import {
  sessionEpoch,
  assertSessionEpoch,
} from "../../platform/auth/secure-session";
import { articleKeys, readArticle } from "./article-api";
import { favoriteId } from "../favorites/favorites-api";

export function createArticleDetailSession(
  userId: number | null,
  rawId: unknown,
  epoch = sessionEpoch(),
) {
  const id = favoriteId(rawId);
  const routeId = typeof rawId === "string" ? rawId : "";
  return {
    epoch,
    id,
    key: [...articleKeys.detail(userId, routeId), epoch] as const,
    async read(signal: AbortSignal) {
      signal.throwIfAborted();
      assertSessionEpoch(epoch);
      if (id === null) throw new Error("文章编号无效");
      return readArticle(String(id), userId, signal, epoch);
    },
  };
}
