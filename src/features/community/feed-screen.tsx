import { EmptyState } from "../../components/empty-state";
import { createThemedStyles, radius } from "../../theme";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
} from "../../components/controls";
import { useCallback, useDeferredValue, useState } from "react";
import { FlatList, Image, RefreshControl, View } from "react-native";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect, type Href } from "expo-router";

import { Text } from "../../../components/Themed";
import { ApiError } from "../../platform/api/api-error";
import { type DynamicCard } from "./community-api";
import { useAuthSession } from "../../platform/auth/session-provider";
import { sessionEpoch } from "../../platform/auth/secure-session";
import {
  communityIdentityKey,
  communitySessionKeys,
  createCommunitySession,
} from "./community-session";

export default function FeedScreen() {
  const styles = useStyles();
  const { user, status } = useAuthSession();
  if (status === "restoring")
    return (
      <View style={styles.state}>
        <Text>正在恢复会话</Text>
      </View>
    );
  return <FeedContent key={communityIdentityKey(user, sessionEpoch())} />;
}
function FeedContent() {
  const styles = useStyles();
  const { user } = useAuthSession();
  const userId = user?.userId ?? null;
  const [session] = useState(() => createCommunitySession(userId));
  const cache = useQueryClient();
  const [focus, setFocus] = useState({ active: false, revision: 0 });
  useFocusEffect(
    useCallback(() => {
      setFocus((value) => ({ active: true, revision: value.revision + 1 }));
      return () => {
        setFocus((value) => ({ ...value, active: false }));
        void cache.cancelQueries({
          queryKey: communitySessionKeys.feeds(userId, session.epoch),
        });
      };
    }, [cache, userId, session]),
  );
  const [search, setSearch] = useState("");
  const keyword = useDeferredValue(search.trim());
  const query = useInfiniteQuery({
    queryKey: [
      ...communitySessionKeys.feed(userId, session.epoch, keyword),
      focus.revision,
    ],
    enabled: focus.active,
    retry: false,
    staleTime: 0,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      session.feed(keyword, pageParam, signal),
    getNextPageParam: (page) =>
      page.hasNext ? (page.nextCursor ?? undefined) : undefined,
  });
  const denied =
    query.error instanceof ApiError && [401, 403].includes(query.error.status);
  const items = denied
    ? []
    : [
        ...new Map(
          query.data?.pages
            .flatMap((page) => page.items)
            .map((item) => [item.dynamicId, item]) ?? [],
        ).values(),
      ];
  if (!focus.active)
    return (
      <View style={styles.state}>
        <Text>正在准备动态</Text>
      </View>
    );

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <Text style={styles.heading}>雪友的新分享</Text>
        <Pressable
          accessibilityRole="button"
          disabled={
            !!user && !user.permissionKeys.includes("community:dynamic:create")
          }
          onPress={() =>
            user
              ? router.push("/dynamics/create" as Href)
              : router.push("/auth")
          }
          style={styles.composeButton}
        >
          <Text style={styles.composeText}>发布</Text>
        </Pressable>
      </View>
      <TextInput
        accessibilityLabel="搜索动态正文"
        placeholder="搜索动态正文"
        returnKeyType="search"
        maxLength={200}
        value={search}
        onChangeText={setSearch}
        style={styles.search}
      />
      {query.isPending ? (
        <View style={styles.state}>
          <ActivityIndicator />
          <Text style={styles.muted}>正在加载动态</Text>
        </View>
      ) : query.isError && (!query.data || denied) ? (
        <View style={styles.state}>
          <Text style={styles.muted}>
            {query.error instanceof ApiError && query.error.status === 0
              ? "暂时无法连接服务。"
              : "动态加载失败。"}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void query.refetch()}
          >
            <Text style={styles.action}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.dynamicId)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            query.isRefetchError && !query.isFetchNextPageError ? (
              <Pressable onPress={() => void query.refetch()}>
                <Text style={styles.action}>刷新失败，点击重试</Text>
              </Pressable>
            ) : undefined
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              onRefresh={() => void query.refetch()}
            />
          }
          renderItem={({ item }) => (
            <DynamicRow
              item={item}
              onPress={() =>
                router.push({
                  pathname: "/dynamics/[dynamicId]",
                  params: { dynamicId: String(item.dynamicId) },
                } as never)
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="还没有公开动态"
              message="分享你的滑雪日常，让下一次上山多一份灵感。"
            />
          }
          ListFooterComponent={
            query.hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                disabled={query.isFetching}
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
            ) : undefined
          }
          onEndReached={() => {
            if (
              query.hasNextPage &&
              !query.isFetching &&
              !query.isFetchNextPageError
            )
              void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
        />
      )}
    </View>
  );
}

function DynamicRow({
  item,
  onPress,
}: {
  item: DynamicCard;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={styles.authorLine}>
        {item.author.avatarUrl ? (
          <Image
            source={{ uri: item.author.avatarUrl }}
            style={styles.avatar}
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarLetter}>
              {item.author.nickname.slice(0, 1)}
            </Text>
          </View>
        )}
        <View style={styles.authorInfo}>
          <Text style={styles.author}>{item.author.nickname}</Text>
          <Text style={styles.meta}>
            {formatDate(item.createdAt)}
            {item.resort ? ` · ${item.resort.name}` : ""}
          </Text>
        </View>
      </View>
      <Text numberOfLines={5} style={styles.body}>
        {item.summary}
      </Text>
      {item.coverUrl ? (
        <Image
          source={{ uri: item.coverUrl }}
          resizeMode="cover"
          style={styles.cover}
        />
      ) : null}
      <View style={styles.counts}>
        <Text style={styles.meta}>赞 {item.likeCount}</Text>
        <Text style={styles.meta}>评论 {item.commentCount}</Text>
      </View>
    </Pressable>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  topbar: {
    minHeight: 62,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.highlight,
  },
  heading: { color: colors.highlightText, fontSize: 24, fontWeight: "700" },
  composeButton: {
    minWidth: 68,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  composeText: { color: colors.accentText, fontWeight: "700" },
  search: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listContent: {
    paddingBottom: 48,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    flexGrow: 1,
  },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.surface,
  },
  authorLine: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 40,
    minHeight: 44,
    borderRadius: 20,
    backgroundColor: colors.soft,
  },
  avatarFallback: {
    width: 40,
    minHeight: 44,
    borderRadius: 20,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: colors.primary, fontWeight: "700" },
  authorInfo: { marginLeft: 12, gap: 4, flex: 1, minWidth: 0 },
  author: { color: colors.text, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 13 },
  body: { color: colors.text, fontSize: 16, lineHeight: 24, marginTop: 14 },
  cover: {
    width: "100%",
    aspectRatio: 1.55,
    borderRadius: radius.md,
    marginTop: 12,
    backgroundColor: colors.soft,
  },
  counts: { flexDirection: "row", gap: 18, marginTop: 13 },
  separator: { height: 8, backgroundColor: colors.background },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  muted: { color: colors.muted },
  action: { color: colors.primary, fontWeight: "600" },
  more: { padding: 18, alignItems: "center" },
}));
