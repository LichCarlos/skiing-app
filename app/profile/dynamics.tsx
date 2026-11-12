import { Text } from "../../components/Themed";
import { Pressable } from "../../src/components/controls";
import { useCallback, useEffect, useState } from "react";
import { Link, Stack, useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, View } from "react-native";
import { type OwnDynamicStatus } from "@/src/features/community/community-api";
import {
  dynamicStatusLabels,
  OwnDynamicsAccess,
  ownDynamicError,
  useOwnStyles,
} from "@/src/features/community/own-dynamics-ui";
import { useAuthSession } from "@/src/platform/auth/session-provider";
import {
  ownDynamicKeys,
  readOwnDynamics,
} from "@/src/features/community/own-dynamics-query";

export default function OwnDynamicsScreen() {
  const { user } = useAuthSession();
  return (
    <>
      <Stack.Screen options={{ title: "我的动态" }} />
      <OwnDynamicsAccess>
        <DynamicList key={user?.userId} />
      </OwnDynamicsAccess>
    </>
  );
}

function DynamicList() {
  const s = useOwnStyles();
  const { user } = useAuthSession();
  const userId = user!.userId;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OwnDynamicStatus | undefined>();
  const [focus, setFocus] = useState({ active: false, revision: 0 });
  const cache = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      setFocus((current) => ({ active: true, revision: current.revision + 1 }));
      return () => {
        setFocus((current) => ({ ...current, active: false }));
        void cache.cancelQueries({ queryKey: ownDynamicKeys.lists(userId) });
      };
    }, [cache, userId]),
  );
  const query = useQuery({
    queryKey: [
      ...ownDynamicKeys.list(user!.userId, page, status),
      focus.revision,
    ],
    queryFn: ({ signal }) =>
      readOwnDynamics(user!.userId, { page, status }, signal),
    enabled: focus.active,
    staleTime: 0,
    retry: false,
  });
  const visible =
    focus.active &&
    !query.isError &&
    !query.isFetching &&
    query.data?.page === page;
  const data = visible ? query.data : undefined;
  useEffect(() => {
    if (!data) return;
    const last = Math.max(1, Math.ceil(data.total / data.pageSize));
    if (page > last) setPage(last);
  }, [data, page]);
  return (
    <FlatList
      style={s.page}
      contentContainerStyle={s.content}
      data={data?.items ?? []}
      keyExtractor={(item) => String(item.dynamicId)}
      refreshing={query.isFetching && !query.isPending}
      onRefresh={() => void query.refetch()}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Text style={s.title}>我的动态</Text>
          {user!.permissionKeys.includes("community:dynamic:create") ? (
            <Link href="/dynamics/create" style={s.link}>
              发布新动态
            </Link>
          ) : null}
          <View style={s.row} accessibilityRole="tablist">
            {([undefined, "pending", "published", "hidden"] as const).map(
              (value) => (
                <Pressable
                  key={value ?? "all"}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: status === value }}
                  onPress={() => {
                    setStatus(value);
                    setPage(1);
                  }}
                >
                  <Text style={[s.link, status === value && s.selected]}>
                    {value ? dynamicStatusLabels[value] : "全部"}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
          {(query.isPending || query.isFetching) && (
            <ActivityIndicator accessibilityLabel="正在加载动态" />
          )}
          {query.isError && (
            <View>
              <Text style={s.error}>{ownDynamicError(query.error)}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void query.refetch()}
              >
                <Text style={s.link}>重试</Text>
              </Pressable>
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <View style={s.card}>
          <Text style={s.muted}>
            {dynamicStatusLabels[item.status]} ·{" "}
            {new Date(item.createdAt).toLocaleString("zh-CN")}
          </Text>
          <Text style={s.body}>{item.summary}</Text>
          <Text style={s.muted}>
            {item.imageCount} 张图片 · {item.likeCount} 赞 · {item.commentCount}{" "}
            条评论{item.resort ? ` · ${item.resort.name}` : ""}
          </Text>
          <Link
            href={{
              pathname: "/profile/dynamics/[id]",
              params: { id: item.dynamicId },
            }}
            style={s.link}
          >
            查看与管理
          </Link>
        </View>
      )}
      ListEmptyComponent={
        data?.items.length === 0 ? (
          <Text style={s.muted}>当前筛选下暂无动态。</Text>
        ) : undefined
      }
      ListFooterComponent={
        data ? (
          <View style={s.row}>
            <Text style={s.muted}>
              第 {page} 页 · 共 {data.total} 条
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={page <= 1 || query.isFetching}
              onPress={() => setPage((value) => value - 1)}
            >
              <Text style={s.link}>上一页</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!data.hasNext || query.isFetching}
              onPress={() => setPage((value) => value + 1)}
            >
              <Text style={s.link}>下一页</Text>
            </Pressable>
          </View>
        ) : undefined
      }
    />
  );
}
