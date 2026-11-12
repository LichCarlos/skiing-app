import { useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "../../platform/auth/session-provider";
import { sessionEpoch } from "../../platform/auth/secure-session";
import { ArticleDetailView } from "./article-detail-view";
import { createArticleDetailSession } from "./article-detail-session";
import { knowledgeIdentityKey } from "./knowledge-list-session";
import { useFavoriteRun } from "../favorites/use-favorite-run";

export default function ArticleDetailScreen() {
  const { user, status } = useAuthSession();
  const { articleId } = useLocalSearchParams<{
    articleId?: string | string[];
  }>();
  return (
    <AccountArticle
      key={JSON.stringify([
        knowledgeIdentityKey(user, sessionEpoch()),
        status,
        articleId,
      ])}
    />
  );
}
function AccountArticle() {
  const { user, status } = useAuthSession();
  const router = useRouter();
  const { articleId } = useLocalSearchParams<{
    articleId?: string | string[];
  }>();
  const userId = user?.userId ?? null;
  const [session] = useState(() =>
    createArticleDetailSession(userId, articleId),
  );
  const { run, state, focus } = useFavoriteRun(userId);
  const canFavorite = !!user?.permissionKeys.includes("member:favorite:toggle");
  const enabled =
    session.id !== null &&
    status !== "restoring" &&
    focus.active &&
    !state.busy;
  const query = useQuery({
    queryKey: [...session.key, focus.revision],
    enabled,
    queryFn: ({ signal }) => session.read(signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <>
      <Stack.Screen
        options={{
          title:
            focus.active && status !== "restoring" && !query.isError
              ? (query.data?.title ?? "文章详情")
              : "文章详情",
        }}
      />
      <ArticleDetailView
        valid={session.id !== null}
        active={focus.active}
        restoring={status === "restoring"}
        loading={query.isPending}
        fetching={query.isFetching}
        article={query.data ?? null}
        error={query.error}
        favorite={state}
        loggedIn={userId !== null}
        canFavorite={canFavorite}
        onLogin={() => {
          if (focus.active) router.push("/auth");
        }}
        onReload={() => {
          if (enabled) void query.refetch();
        }}
        onReview={() => {
          if (enabled && canFavorite && !query.isFetching) void run.review();
        }}
        onFavorite={(desired) => {
          if (
            enabled &&
            session.id !== null &&
            canFavorite &&
            !query.isFetching &&
            !query.isError &&
            query.data &&
            !state.needsReview
          )
            void run.set(
              { targetType: "article", targetId: session.id },
              desired,
            );
        }}
      />
    </>
  );
}
