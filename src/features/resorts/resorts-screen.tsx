import { EmptyState } from "../../components/empty-state";
import { brutalFrame, createThemedStyles, radius } from "../../theme";
import { ActivityIndicator, Pressable } from "../../components/controls";
import { useCallback, useState } from "react";
import { Image, RefreshControl, ScrollView, View } from "react-native";
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";

import { Text } from "../../../components/Themed";
import { ApiError } from "../../platform/api/api-error";
import { useAuthSession } from "../../platform/auth/session-provider";
import { sessionEpoch } from "../../platform/auth/secure-session";
import { useFavoriteRun } from "../favorites/use-favorite-run";

import { ResortFilterForm } from "./resort-filters";
import {
  buildResortQuery,
  emptyResortFilters,
  formatResortDistance,
  readResorts,
  readPublicResortFitTags,
  resortKeys,
  resortStatusLabels,
  type ResortFilters,
} from "./resort-query";
export default function ResortsScreen() {
  const { user, status } = useAuthSession();
  const key = JSON.stringify([
    user?.userId,
    user?.account,
    status,
    [...(user?.permissionKeys ?? [])].sort(),
    sessionEpoch(),
  ]);
  return <AccountResorts key={key} />;
}

function AccountResorts() {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { user, status: sessionStatus } = useAuthSession();
  const userId = user?.userId ?? null;
  const [epoch] = useState(sessionEpoch);
  const { run, state: favorite, focus } = useFavoriteRun(userId);
  const canFavorite = !!user?.permissionKeys.includes("member:favorite:toggle");
  const [draft, setDraft] = useState<ResortFilters>(emptyResortFilters);
  const [filters, setFilters] = useState<ResortFilters>(emptyResortFilters);
  const [filterError, setFilterError] = useState<string | null>(null);
  const fitTagsQuery = useQuery({
    queryKey: [...resortKeys.fitTags(), focus.revision],
    queryFn: ({ signal }) => readPublicResortFitTags(signal),
    enabled: focus.active && sessionStatus !== "restoring",
    retry: 1,
  });
  useFocusEffect(
    useCallback(
      () => () => {
        void queryClient.cancelQueries({ queryKey: resortKeys.fitTags() });
      },
      [queryClient],
    ),
  );
  const filterQuery = buildResortQuery(filters).toString();
  function applyFilters() {
    if (!focus.active || favorite.busy || sessionEpoch() !== epoch) return;
    try {
      const query = buildResortQuery(draft);
      void queryClient.resetQueries({
        queryKey: resortKeys.list(user?.userId ?? null, query.toString()),
        exact: false,
      });
      setFilters({ ...draft, fitTags: [...draft.fitTags] });
      setFilterError(null);
    } catch (cause) {
      setFilterError(cause instanceof Error ? cause.message : "筛选条件无效");
    }
  }
  function resetFilters() {
    if (!focus.active || favorite.busy || sessionEpoch() !== epoch) return;
    void queryClient.resetQueries({
      queryKey: resortKeys.list(
        user?.userId ?? null,
        buildResortQuery(emptyResortFilters).toString(),
      ),
      exact: false,
    });
    setDraft(emptyResortFilters);
    setFilters(emptyResortFilters);
    setFilterError(null);
  }
  const query = useInfiniteQuery({
    queryKey: [...resortKeys.list(userId, filterQuery), focus.revision],
    enabled: focus.active && sessionStatus !== "restoring" && !favorite.busy,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      readResorts(
        buildResortQuery(filters, pageParam),
        user?.userId ?? null,
        signal,
        undefined,
        epoch,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.hasNext ? lastPage.page + 1 : undefined,
  });
  const resorts = query.data?.pages.flatMap((page) => page.items) ?? [];
  const initialError = query.error;
  const accessDenied =
    initialError instanceof ApiError &&
    [401, 403].includes(initialError.status);
  const errorText =
    initialError instanceof ApiError && initialError.status === 0
      ? "暂时无法连接服务，请检查网络后重试。"
      : accessDenied
        ? "登录账号已变化，请重新登录或刷新。"
        : "雪场信息加载失败，请重试。";
  const reload = () => {
    if (focus.active && !favorite.busy) void query.refetch();
  };
  if (!focus.active || sessionStatus === "restoring")
    return (
      <View style={styles.state}>
        <ActivityIndicator accessibilityLabel="正在准备雪场列表" />
      </View>
    );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={reload}
        />
      }
    >
      <View style={styles.heading}>
        <Text style={styles.title}>雪场</Text>
        <Text style={styles.count}>
          {query.data?.pages[0]?.total ?? " "} 个公开雪场
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/catalog")}
      >
        <Text style={styles.action}>按扩展字段查询公开数据</Text>
      </Pressable>
      <ResortFilterForm
        value={draft}
        onChange={setDraft}
        onApply={applyFilters}
        onReset={resetFilters}
        error={filterError}
        fitTags={fitTagsQuery.data ?? []}
        fitTagsUnavailable={fitTagsQuery.isError}
      />
      {favorite.notice && (
        <Text accessibilityRole="alert" style={styles.favoriteError}>
          {favorite.notice}
        </Text>
      )}
      {favorite.needsReview && (
        <Pressable
          accessibilityRole="button"
          disabled={favorite.busy}
          onPress={() => void run.review()}
        >
          <Text style={styles.action}>核对上次操作的收藏状态</Text>
        </Pressable>
      )}

      {query.isPending ? (
        <View style={styles.state}>
          <ActivityIndicator />
          <Text style={styles.stateText}>正在加载雪场…</Text>
        </View>
      ) : accessDenied || (query.isError && resorts.length === 0) ? (
        <View style={styles.state}>
          <Text style={styles.stateText}>{errorText}</Text>
          <Pressable accessibilityRole="button" onPress={reload}>
            <Text style={styles.action}>重试</Text>
          </Pressable>
        </View>
      ) : resorts.length === 0 ? (
        <EmptyState
          title="没有符合条件的雪场"
          message="试试其他地区或价格范围，也可以重置筛选条件。"
        />
      ) : (
        <View style={styles.list}>
          {query.isRefetchError && !query.isFetchNextPageError && (
            <Pressable
              accessibilityRole="button"
              disabled={favorite.busy}
              onPress={reload}
            >
              <Text style={styles.action}>刷新失败，点击重试</Text>
            </Pressable>
          )}
          {resorts.map((resort) => (
            <View key={resort.resortId} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`查看${resort.name}详情`}
                onPress={() =>
                  router.push({
                    pathname: "/resorts/[resortId]",
                    params: { resortId: String(resort.resortId) },
                  })
                }
                style={styles.cardContent}
              >
                {resort.coverUrl ? (
                  <Image
                    source={{ uri: resort.coverUrl }}
                    style={styles.cover}
                  />
                ) : (
                  <View style={[styles.cover, styles.coverFallback]}>
                    <Text style={styles.coverFallbackText}>雪场</Text>
                  </View>
                )}
                <View style={styles.details}>
                  <View style={styles.nameLine}>
                    <Text style={styles.name} numberOfLines={1}>
                      {resort.name}
                    </Text>
                    <Text
                      style={[
                        styles.open,
                        resort.openStatus !== "open" && styles.closed,
                      ]}
                    >
                      {resortStatusLabels[resort.openStatus]}
                    </Text>
                  </View>
                  <Text style={styles.region} numberOfLines={1}>
                    {[
                      resort.region.province,
                      resort.region.city,
                      resort.region.district,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <View style={styles.meta}>
                    <Text style={styles.rating}>
                      {resort.rating === null
                        ? "暂无评分"
                        : `★ ${resort.rating.toFixed(1)} (${resort.ratingCount})`}
                    </Text>
                    <Text style={styles.price}>
                      {resort.startingPrice === null
                        ? "价格待更新"
                        : `¥${resort.startingPrice} 起`}
                    </Text>
                  </View>
                  {formatResortDistance(resort.distanceMeters) ? (
                    <Text style={styles.region}>
                      距参考点 {formatResortDistance(resort.distanceMeters)}
                    </Text>
                  ) : null}
                  {resort.fitTags.length ? (
                    <Text style={styles.tags} numberOfLines={1}>
                      {resort.fitTags.map((tag) => tag.label).join(" · ")}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              {user && canFavorite ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    resort.favoriteByMe ? "取消收藏" : "收藏雪场"
                  }
                  accessibilityState={{
                    disabled:
                      favorite.busy || favorite.needsReview || query.isFetching,
                  }}
                  disabled={
                    favorite.busy || favorite.needsReview || query.isFetching
                  }
                  onPress={() =>
                    void run.set(
                      { targetType: "resort", targetId: resort.resortId },
                      !resort.favoriteByMe,
                    )
                  }
                  style={styles.favoriteButton}
                >
                  {favorite.busy &&
                  favorite.pending?.targetId === resort.resortId ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={styles.favoriteText}>
                      {resort.favoriteByMe ? "已收藏" : "收藏"}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {query.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          disabled={query.isFetching || favorite.busy}
          onPress={() => void query.fetchNextPage()}
          style={styles.more}
        >
          {query.isFetchingNextPage ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.action}>
              {query.isFetchNextPageError
                ? "加载更多失败，点击重试"
                : "加载更多"}
            </Text>
          )}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 20,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  heading: {
    ...brutalFrame(colors),
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.warm,
  },
  title: { fontSize: 24, fontWeight: "700", color: colors.highlightText },
  count: { color: colors.highlightText, fontSize: 13 },
  list: { gap: 16 },
  row: {
    ...brutalFrame(colors, true),
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  cardContent: { flex: 1, minWidth: 0, flexDirection: "row", gap: 12 },
  cover: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.soft,
  },
  coverFallback: { alignItems: "center", justifyContent: "center" },
  coverFallbackText: { color: colors.muted, fontSize: 13 },
  details: { flex: 1, minWidth: 0, justifyContent: "center", gap: 5 },
  favoriteButton: {
    minWidth: 48,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  favoriteText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  favoriteError: { color: colors.error, fontSize: 13 },
  nameLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  name: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "600" },
  open: { color: colors.primary, fontSize: 11 },
  closed: { color: colors.muted },
  region: { color: colors.muted, fontSize: 12 },
  meta: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  rating: { color: colors.accent, fontSize: 12 },
  price: { color: colors.text, fontSize: 13, fontWeight: "600" },
  tags: { color: colors.muted, fontSize: 11 },
  state: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  stateText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  action: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  more: { minHeight: 44, alignItems: "center", justifyContent: "center" },
}));
