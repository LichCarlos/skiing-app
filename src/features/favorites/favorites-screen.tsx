import { createThemedStyles } from "../../theme";
import { ActivityIndicator, Pressable } from "../../components/controls";
import {
  createFavoritesSession,
  favoriteIdentityKey,
} from "./favorites-session";
import {
  type FavoriteItem,
  type FavoriteFilter as Filter,
} from "./favorites-api";
import { useFavoriteRun } from "./use-favorite-run";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Text } from "../../../components/Themed";
import { ApiError } from "../../platform/api/api-error";
import { useAuthSession } from "../../platform/auth/session-provider";

export default function FavoritesScreen(): React.JSX.Element {
  const { user, status } = useAuthSession();
  return <AccountFavorites key={favoriteIdentityKey(user, status)} />;
}

function AccountFavorites(): React.JSX.Element {
  const styles = useStyles();
  const router = useRouter();
  const { user, status } = useAuthSession();
  const userId = user?.userId ?? null;
  const [session] = useState(() => createFavoritesSession(userId));
  const canUse = !!user?.permissionKeys.includes("member:favorite:toggle");
  const { run, state, focus } = useFavoriteRun(userId);
  const [filter, setFilter] = useState<Filter>("all");
  const queryKey = [...session.key, filter, focus.revision] as const;
  const enabled =
    Boolean(user) &&
    canUse &&
    status !== "restoring" &&
    focus.active &&
    !state.busy;
  const reload = () => {
    if (enabled && !favorites.isFetching) void favorites.refetch();
  };
  const review = () => {
    if (enabled && !favorites.isFetching) void run.review();
  };
  const favorites = useInfiniteQuery({
    queryKey,
    enabled,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      run.read(signal, (live) => session.list(pageParam, filter, live)),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  const items =
    enabled && !favorites.isError && !favorites.isRefetching
      ? (favorites.data?.pages.flatMap(({ items: pageItems }) => pageItems) ??
        [])
      : [];
  const isInitialLoading = favorites.isPending && Boolean(user);
  const errorMessage =
    favorites.error instanceof ApiError &&
    [401, 403].includes(favorites.error.status)
      ? "登录账号或收藏权限已变化，请重新登录或刷新。"
      : "收藏加载失败，请检查网络后重试。";

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "我的收藏" }} />
      <Text style={styles.title}>我的收藏</Text>
      {state.notice ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {state.notice}
        </Text>
      ) : null}
      {state.needsReview ? (
        <Pressable
          accessibilityRole="button"
          disabled={state.busy}
          onPress={review}
        >
          <Text style={styles.action}>核对上次操作的收藏状态</Text>
        </Pressable>
      ) : null}
      {!focus.active || status === "restoring" ? (
        <ActivityIndicator accessibilityLabel="正在恢复登录" />
      ) : !user ? (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>登录后查看收藏</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (focus.active) router.push("/auth");
            }}
          >
            <Text style={styles.action}>登录 / 注册</Text>
          </Pressable>
        </View>
      ) : !canUse ? (
        <Text style={styles.stateText}>当前账号没有收藏管理权限。</Text>
      ) : (
        <>
          <View style={styles.filters} accessibilityRole="tablist">
            {(
              [
                ["all", "全部"],
                ["resort", "雪场"],
                ["article", "文章"],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: filter === value }}
                disabled={state.busy}
                onPress={() => {
                  if (enabled && !favorites.isFetching) setFilter(value);
                }}
                style={[
                  styles.filter,
                  filter === value && styles.filterSelected,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === value && styles.filterTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={state.busy || favorites.isFetching}
            onPress={reload}
          >
            <Text style={styles.action}>刷新收藏列表</Text>
          </Pressable>
          {isInitialLoading || state.busy || favorites.isRefetching ? (
            <View style={styles.state}>
              <ActivityIndicator />
              <Text style={styles.stateText}>正在加载收藏</Text>
            </View>
          ) : favorites.isError ? (
            <View style={styles.state}>
              <Text style={styles.stateTitle}>{errorMessage}</Text>
              <Pressable accessibilityRole="button" onPress={reload}>
                <Text style={styles.action}>重试</Text>
              </Pressable>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.state}>
              <Text style={styles.stateTitle}>还没有收藏内容</Text>
              <Text style={styles.stateText}>收藏的雪场和文章会显示在这里</Text>
            </View>
          ) : (
            <>
              {items.map((favorite) => (
                <FavoriteRow
                  key={favorite.favoriteId}
                  favorite={favorite}
                  removing={state.busy}
                  disabled={
                    state.busy || state.needsReview || favorites.isFetching
                  }
                  onRemove={() => {
                    if (!enabled || state.needsReview || favorites.isFetching)
                      return;
                    void run.set(
                      {
                        targetType: favorite.targetType,
                        targetId: favorite.target.id,
                      },
                      false,
                    );
                  }}
                />
              ))}
              {favorites.hasNextPage ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={favorites.isFetching || state.busy}
                  onPress={() => {
                    if (
                      enabled &&
                      favorites.hasNextPage &&
                      !favorites.isFetching
                    )
                      void favorites.fetchNextPage();
                  }}
                  style={styles.moreButton}
                >
                  {favorites.isFetchingNextPage ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={styles.action}>加载更多</Text>
                  )}
                </Pressable>
              ) : null}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function FavoriteRow({
  favorite,
  removing,
  disabled,
  onRemove,
}: {
  favorite: FavoriteItem;
  removing: boolean;
  disabled: boolean;
  onRemove: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const router = useRouter();
  const target = favorite.target;
  const title = target.targetType === "resort" ? target.name : target.title;
  const details =
    target.targetType === "resort"
      ? [target.province, target.city, target.district]
          .filter(Boolean)
          .join(" · ")
      : target.summary;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          target.targetType === "resort"
            ? router.push({
                pathname: "/resorts/[resortId]",
                params: { resortId: String(target.id) },
              })
            : router.push({
                pathname: "/knowledge/[articleId]",
                params: { articleId: String(target.id) },
              })
        }
        style={styles.rowCopy}
      >
        <Text style={styles.rowType}>
          {target.targetType === "resort" ? "雪场" : "文章"}
        </Text>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.rowDetails} numberOfLines={2}>
          {details || " "}
        </Text>
        <Text style={styles.rowDate}>
          {new Date(favorite.favoritedAt).toLocaleDateString()}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="取消收藏"
        disabled={disabled}
        onPress={onRemove}
        style={styles.removeButton}
      >
        {removing ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.removeText}>移除</Text>
        )}
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 36 },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "700",
    marginBottom: 18,
  },
  filters: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 8,
  },
  filter: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  filterSelected: { borderBottomColor: colors.primary },
  filterText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  filterTextSelected: { color: colors.primary },
  state: {
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  stateText: { color: colors.muted, fontSize: 14 },
  action: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 16,
    gap: 14,
  },
  rowCopy: { flex: 1, gap: 5 },
  rowType: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  rowDetails: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  rowDate: { color: colors.muted, fontSize: 13, marginTop: 2 },
  removeButton: {
    minWidth: 56,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  moreButton: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
  },
  error: { color: colors.error, fontSize: 13, marginTop: 12 },
}));
