import { brutalFrame, createThemedStyles, radius } from "../../theme";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
} from "../../components/controls";
import { useCallback, useDeferredValue, useState } from "react";
import { FlatList, Image, RefreshControl, View } from "react-native";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import type { components } from "../../platform/api/openapi";
import { Text } from "../../../components/Themed";
import { ApiError } from "../../platform/api/api-error";
import { useAuthSession } from "../../platform/auth/session-provider";
import { sessionEpoch } from "../../platform/auth/secure-session";
import {
  createKnowledgeListSession,
  knowledgeListKeys,
  knowledgeIdentityKey,
} from "./knowledge-list-session";
import { buildArticleQuery } from "./article-query";

type Article = components["schemas"]["PublicArticleSummaryVO"];

export default function KnowledgeScreen() {
  const styles = useStyles();
  const { user, status } = useAuthSession();
  if (status === "restoring")
    return (
      <View style={styles.state}>
        <Text>正在恢复会话</Text>
      </View>
    );
  return <KnowledgeList key={knowledgeIdentityKey(user, sessionEpoch())} />;
}
function KnowledgeList() {
  const styles = useStyles();
  const { user } = useAuthSession();
  const userId = user?.userId ?? null;
  const [session] = useState(() => createKnowledgeListSession(userId));
  const cache = useQueryClient();
  const [focus, setFocus] = useState({ active: false, revision: 0 });
  useFocusEffect(
    useCallback(() => {
      setFocus((value) => ({ active: true, revision: value.revision + 1 }));
      return () => {
        setFocus((value) => ({ ...value, active: false }));
        void cache.cancelQueries({
          queryKey: knowledgeListKeys.lists(userId, session.epoch),
        });
        void cache.cancelQueries({
          queryKey: knowledgeListKeys.categories(userId, session.epoch),
        });
      };
    }, [cache, userId, session]),
  );
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const keyword = useDeferredValue(search.trim());
  let filters: string | null = null;
  let filterError: string | null = null;
  try {
    filters = buildArticleQuery(keyword, selectedCategory).toString();
  } catch (error) {
    filterError = error instanceof Error ? error.message : "Invalid filters";
  }
  const categoriesQuery = useQuery({
    queryKey: [
      ...knowledgeListKeys.categories(userId, session.epoch),
      focus.revision,
    ],
    queryFn: ({ signal }) => session.categories(signal),
    enabled: focus.active,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const articlesQuery = useInfiniteQuery({
    queryKey: [
      ...knowledgeListKeys.lists(userId, session.epoch),
      filters,
      focus.revision,
    ],
    enabled: focus.active && filters !== null,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      session.list(keyword, selectedCategory, pageParam, signal),
    getNextPageParam: (page) => (page.hasNext ? page.page + 1 : undefined),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const denied =
    articlesQuery.error instanceof ApiError &&
    [401, 403].includes(articlesQuery.error.status);
  const invalid = articlesQuery.error instanceof TypeError;
  const articles =
    denied || invalid
      ? []
      : [
          ...new Map(
            articlesQuery.data?.pages
              .flatMap((page) => page.items)
              .map((item) => [item.articleId, item]) ?? [],
          ).values(),
        ];
  if (!focus.active)
    return (
      <View style={styles.state}>
        <Text>正在准备知识列表</Text>
      </View>
    );

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>滑雪知识</Text>
      <TextInput
        accessibilityLabel="搜索文章标题或摘要"
        value={search}
        onChangeText={setSearch}
        placeholder="搜索滑雪知识"
        returnKeyType="search"
        maxLength={100}
        style={styles.search}
      />
      {categoriesQuery.isError ? (
        <View style={styles.inlineError}>
          <Text style={styles.muted}>分类暂时无法加载</Text>
          <Pressable onPress={() => void categoriesQuery.refetch()}>
            <Text style={styles.action}>重试</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        horizontal
        data={[
          { value: "", label: "全部" },
          ...(!categoriesQuery.isError ? (categoriesQuery.data ?? []) : []),
        ]}
        keyExtractor={(item) => item.value || "all"}
        showsHorizontalScrollIndicator={false}
        style={styles.categoryViewport}
        contentContainerStyle={styles.categoryList}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selectedCategory === item.value }}
            onPress={() => setSelectedCategory(item.value)}
            style={[
              styles.categoryButton,
              selectedCategory === item.value && styles.categorySelected,
            ]}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === item.value && styles.categoryTextSelected,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        )}
      />
      {selectedCategory ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedCategory("")}
        >
          <Text style={styles.action}>清除分类筛选</Text>
        </Pressable>
      ) : null}

      {filterError ? (
        <View style={styles.state}>
          <Text style={styles.muted}>{filterError}</Text>
        </View>
      ) : articlesQuery.isPending ? (
        <View style={styles.state}>
          <ActivityIndicator />
          <Text style={styles.muted}>正在加载文章</Text>
        </View>
      ) : articlesQuery.isError &&
        (!articlesQuery.data || denied || invalid) ? (
        <View style={styles.state}>
          <Text style={styles.muted}>
            {articlesQuery.error instanceof ApiError &&
            articlesQuery.error.status === 0
              ? "暂时无法连接服务。"
              : "文章加载失败。"}
          </Text>
          <Pressable onPress={() => void articlesQuery.refetch()}>
            <Text style={styles.action}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={articles}
          keyExtractor={(item) => String(item.articleId)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.listHeading}>
              <Text style={styles.muted}>
                {articlesQuery.data?.pages[0]?.total ?? 0} 篇公开文章
              </Text>
              {articlesQuery.isRefetchError &&
              !articlesQuery.isFetchNextPageError ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void articlesQuery.refetch()}
                >
                  <Text style={styles.action}>刷新失败，点击重试</Text>
                </Pressable>
              ) : null}
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={
                articlesQuery.isRefetching && !articlesQuery.isFetchingNextPage
              }
              onRefresh={() => void articlesQuery.refetch()}
            />
          }
          onEndReached={() => {
            if (
              articlesQuery.hasNextPage &&
              !articlesQuery.isFetching &&
              !articlesQuery.isFetchNextPageError
            ) {
              void articlesQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.45}
          ListEmptyComponent={
            <View style={styles.state}>
              <Text style={styles.emptyTitle}>没有找到相关文章</Text>
              <Text style={styles.muted}>试试其他关键词或分类。</Text>
            </View>
          }
          ListFooterComponent={
            articlesQuery.isFetchingNextPage ? (
              <ActivityIndicator style={styles.footerLoading} />
            ) : articlesQuery.isFetchNextPageError ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void articlesQuery.fetchNextPage()}
                style={styles.listHeading}
              >
                <Text style={styles.action}>加载更多失败，点击重试</Text>
              </Pressable>
            ) : undefined
          }
          renderItem={({ item }) => (
            <ArticleRow
              article={item}
              onPress={() =>
                router.push({
                  pathname: "/knowledge/[articleId]",
                  params: { articleId: String(item.articleId) },
                })
              }
            />
          )}
        />
      )}
    </View>
  );
}

function ArticleRow({
  article,
  onPress,
}: {
  article: Article;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.article}
    >
      {article.coverUrl ? (
        <Image source={{ uri: article.coverUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Text style={styles.coverMark}>凛</Text>
        </View>
      )}
      <View style={styles.articleContent}>
        <View style={styles.articleMeta}>
          <Text style={styles.categoryLabel}>{article.category.label}</Text>
          <Text style={styles.date}>{formatDate(article.publishTime)}</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {article.title}
        </Text>
        <Text style={styles.summary} numberOfLines={3}>
          {article.summary}
        </Text>
        <Text style={styles.author}>{article.authorName || "凛迹雪客"}</Text>
        {article.favoriteByMe ? (
          <Text style={styles.action}>已收藏</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background, paddingTop: 14 },
  heading: {
    backgroundColor: colors.highlight,
    padding: 14,
    borderRadius: radius.md,
    ...brutalFrame(colors),
    marginHorizontal: 20,
    marginBottom: 14,
    color: colors.highlightText,
    fontSize: 22,
    fontWeight: "700",
  },
  search: {
    height: 44,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  categoryViewport: { flexGrow: 0, flexShrink: 0 },
  categoryList: { paddingHorizontal: 20, paddingBottom: 13, gap: 8 },
  categoryButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  categorySelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  categoryText: { color: colors.muted, fontSize: 13 },
  categoryTextSelected: { color: colors.primaryText, fontWeight: "600" },
  inlineError: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  state: {
    flex: 1,
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  muted: { color: colors.muted, fontSize: 14, textAlign: "center" },
  action: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    flexGrow: 1,
  },
  listHeading: { paddingVertical: 12, alignItems: "center", gap: 8 },
  article: {
    ...brutalFrame(colors, true),
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: 4,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  cover: {
    width: 108,
    height: 116,
    flexShrink: 0,
    borderRadius: radius.md,
    backgroundColor: colors.soft,
  },
  coverFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.soft,
  },
  coverMark: { color: colors.muted, fontSize: 30, fontWeight: "700" },
  articleContent: { flex: 1, minWidth: 0, gap: 6 },
  articleMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  categoryLabel: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  date: { color: colors.muted, fontSize: 11 },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  summary: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  author: { marginTop: "auto", color: colors.muted, fontSize: 11 },
  separator: { height: 16 },
  footerLoading: { marginTop: 12, marginBottom: 18 },
}));
