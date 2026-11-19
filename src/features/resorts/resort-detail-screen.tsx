import { createThemedStyles, radius } from "../../theme";
import { ActivityIndicator, Pressable } from "../../components/controls";
import { useState } from "react";
import {
  createResortDetailSession,
  favoriteIdentityKey,
} from "../favorites/favorites-session";
import { useFavoriteRun } from "../favorites/use-favorite-run";
import { resortStatusLabels } from "./resort-query";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Image, Linking, ScrollView, View } from "react-native";

import { Text } from "../../../components/Themed";
import { ApiError } from "../../platform/api/api-error";
import { useAuthSession } from "../../platform/auth/session-provider";

export default function ResortDetailScreen() {
  const { user, status } = useAuthSession();
  const { resortId } = useLocalSearchParams<{ resortId?: string | string[] }>();
  return (
    <AccountResortDetail
      key={JSON.stringify([favoriteIdentityKey(user, status), resortId])}
    />
  );
}

function AccountResortDetail() {
  const styles = useStyles();
  const { resortId } = useLocalSearchParams<{ resortId?: string | string[] }>();
  const router = useRouter();
  const { user, status } = useAuthSession();
  const userId = user?.userId ?? null;
  const [session] = useState(() => createResortDetailSession(userId, resortId));
  const id = session.id;
  const { run, state, focus } = useFavoriteRun(userId);
  const canUse = !!user?.permissionKeys.includes("member:favorite:toggle");
  const enabled =
    id !== null && focus.active && status !== "restoring" && !state.busy;
  const review = () => {
    if (enabled && canUse && !query.isFetching) void run.review();
  };
  const reload = () => {
    if (enabled && !query.isFetching) void query.refetch();
  };
  const query = useQuery({
    queryKey: [...session.key, focus.revision],
    queryFn: ({ signal }) => session.read(signal),
    enabled,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (id === null) {
    return (
      <View style={styles.state}>
        <Stack.Screen options={{ title: "雪场详情" }} />
        <Text style={styles.muted}>雪场链接无效。</Text>
      </View>
    );
  }

  if (!focus.active || query.isPending || status === "restoring") {
    return (
      <View style={styles.state}>
        <Stack.Screen options={{ title: "雪场详情" }} />
        <ActivityIndicator />
        <Text style={styles.muted}>正在加载雪场资料…</Text>
      </View>
    );
  }

  if (query.isError || !query.data) {
    const unavailable =
      query.error instanceof ApiError && query.error.status === 404;
    return (
      <View style={styles.state}>
        <Stack.Screen options={{ title: "雪场详情" }} />
        <Text style={styles.muted}>
          {unavailable
            ? "该雪场暂不可用。"
            : "雪场资料加载失败，请检查网络后重试。"}
        </Text>
        {state.notice ? (
          <Text accessibilityRole="alert" style={styles.favoriteError}>
            {state.notice}
          </Text>
        ) : null}
        {state.needsReview ? (
          <Pressable
            accessibilityRole="button"
            disabled={state.busy}
            onPress={review}
          >
            <Text style={styles.link}>核对上次操作的收藏状态</Text>
          </Pressable>
        ) : null}
        {!unavailable ? (
          <Pressable accessibilityRole="button" onPress={reload}>
            <Text style={styles.link}>重试</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const resort = query.data;
  const region = [
    resort.region.province,
    resort.region.city,
    resort.region.district,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: resort.name }} />
      {resort.coverUrl ? (
        <Image source={{ uri: resort.coverUrl }} style={styles.cover} />
      ) : null}
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{resort.name}</Text>
        <Text style={styles.muted}>{region}</Text>
        <View style={styles.summary}>
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
          <Text style={styles.muted}>
            {resortStatusLabels[resort.openStatus]}
          </Text>
        </View>
      </View>
      {state.notice ? (
        <Text accessibilityRole="alert" style={styles.favoriteError}>
          {state.notice}
        </Text>
      ) : null}
      {state.needsReview ? (
        <Pressable
          accessibilityRole="button"
          disabled={state.busy}
          onPress={review}
        >
          <Text style={styles.link}>核对上次操作的收藏状态</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={state.busy || query.isFetching}
        onPress={reload}
      >
        <Text style={styles.link}>刷新雪场与收藏状态</Text>
      </Pressable>
      {!user ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (focus.active) router.push("/auth");
          }}
        >
          <Text style={styles.link}>登录后收藏雪场</Text>
        </Pressable>
      ) : !canUse ? (
        <Text style={styles.muted}>当前账号没有收藏权限。</Text>
      ) : null}
      {canUse ? (
        <View style={styles.favoriteAction}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled: state.busy || state.needsReview || query.isFetching,
            }}
            disabled={state.busy || state.needsReview || query.isFetching}
            onPress={() => {
              if (
                !enabled ||
                !canUse ||
                query.isFetching ||
                query.isError ||
                state.needsReview
              )
                return;
              void run.set(
                { targetType: "resort", targetId: id },
                !resort.favoriteByMe,
              );
            }}
            style={styles.favoriteButton}
          >
            {state.busy ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.favoriteText}>
                {query.isFetching
                  ? "正在核对收藏状态…"
                  : resort.favoriteByMe
                    ? "已收藏，点击取消"
                    : "收藏雪场"}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
      {resort.fitTags.length ? (
        <Text style={styles.tags}>
          {resort.fitTags.map((tag) => tag.label).join(" · ")}
        </Text>
      ) : null}
      <Section title="雪况">
        <Text style={styles.body}>{resort.snowCondition.label}</Text>
        {resort.snowCondition.verifiedAt ? (
          <Text style={styles.muted}>
            更新于 {new Date(resort.snowCondition.verifiedAt).toLocaleString()}
          </Text>
        ) : null}
      </Section>
      {resort.address ? (
        <Section title="地址">
          <Text style={styles.body}>{resort.address}</Text>
        </Section>
      ) : null}
      {resort.openingHours ? (
        <Section title="开放时间">
          <Text style={styles.body}>{resort.openingHours}</Text>
        </Section>
      ) : null}
      <Section title="雪场介绍">
        <Text style={styles.body}>{resort.description}</Text>
      </Section>
      {resort.trailSummary ? (
        <Section title="雪道信息">
          <Text style={styles.body}>{resort.trailSummary}</Text>
        </Section>
      ) : null}
      {resort.facilitySummary ? (
        <Section title="设施信息">
          <Text style={styles.body}>{resort.facilitySummary}</Text>
        </Section>
      ) : null}
      {resort.galleryUrls.map((url, index) => (
        <Image
          key={`${url}-${index}`}
          source={{ uri: url }}
          style={styles.gallery}
        />
      ))}
      {resort.customFields.map((field) => (
        <Section key={field.fieldKey} title={field.label}>
          <Text style={styles.body}>{formatCustomField(field.value)}</Text>
        </Section>
      ))}
      {resort.officialUrl ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            if (enabled)
              void Linking.openURL(resort.officialUrl!).catch(() => undefined);
          }}
        >
          <Text style={styles.link}>访问雪场官网</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (focus.active) router.back();
        }}
      >
        <Text style={styles.link}>返回雪场列表</Text>
      </Pressable>
    </ScrollView>
  );
}

function formatCustomField(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  if (Array.isArray(value)) return value.map(formatCustomField).join("、");
  return JSON.stringify(value);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    backgroundColor: colors.background,
  },
  cover: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.soft,
  },
  gallery: {
    width: "100%",
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.soft,
  },
  titleBlock: { gap: 7 },
  favoriteAction: { gap: 6, alignItems: "flex-start" },
  favoriteButton: {
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
  },
  favoriteText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  favoriteError: { color: colors.error, fontSize: 13 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    marginTop: 3,
  },
  rating: { color: colors.accent, fontSize: 14 },
  price: { color: colors.text, fontWeight: "700", fontSize: 14 },
  muted: { color: colors.muted, fontSize: 13 },
  tags: { color: colors.primary, fontSize: 13 },
  section: {
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  body: { color: colors.text, fontSize: 14, lineHeight: 21 },
  link: { color: colors.primary, fontSize: 14, fontWeight: "600" },
}));
