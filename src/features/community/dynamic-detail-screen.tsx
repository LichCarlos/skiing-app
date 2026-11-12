import { MarkdownView } from "../content/markdown-view";
import { createThemedStyles, radius } from "../../theme";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
} from "../../components/controls";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Stack,
  useLocalSearchParams,
  useRouter,
  useFocusEffect,
} from "expo-router";
import { useCallback, useState } from "react";
import { Image, ScrollView, View } from "react-native";

import { Text } from "../../../components/Themed";
import { CommunityActionGate } from "./community-action-gate";
import { communityKeys } from "./community-query";
import { ApiError } from "../../platform/api/api-error";
import { useAuthSession } from "../../platform/auth/session-provider";
import { sessionEpoch } from "../../platform/auth/secure-session";
import {
  communityIdentityKey,
  communitySessionKeys,
  createCommunitySession,
} from "./community-session";
import { type DynamicDetail } from "./community-api";

export default function DynamicDetailScreen() {
  const { dynamicId } = useLocalSearchParams<{ dynamicId: string }>();
  const { user, status } = useAuthSession();
  const id =
    typeof dynamicId === "string" && /^[1-9]\d*$/.test(dynamicId)
      ? Number(dynamicId)
      : NaN;
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)
    return <State title="动态详情" message="动态编号无效。" />;
  if (status === "restoring")
    return <State title="动态详情" message="正在恢复会话" />;
  return (
    <DynamicDetailContent
      key={`${communityIdentityKey(user, sessionEpoch())}:${id}`}
      id={id}
      userId={user?.userId ?? null}
    />
  );
}

function DynamicDetailContent({
  id,
  userId,
}: {
  id: number;
  userId: number | null;
}) {
  const styles = useStyles();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const [session] = useState(() => createCommunitySession(userId));
  const [focus, setFocus] = useState({ active: false, revision: 0 });
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    uncertain: boolean;
    reviewRequired?: boolean;
  } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<"dynamic" | number | null>(
    null,
  );
  const [gate] = useState(
    () =>
      new CommunityActionGate(
        userId,
        async (signal) => {
          await session.verify(signal);
          return { userId: userId ?? 0 };
        },
        setBusy,
        session.check,
      ),
  );
  const detailKey = communitySessionKeys.detail(id, userId, session.epoch);
  const commentKey = communitySessionKeys.comments(id, userId, session.epoch);
  useFocusEffect(
    useCallback(() => {
      gate.activate();
      setFocus((value) => ({ active: true, revision: value.revision + 1 }));
      setDeleteTarget(null);
      setReviewed(false);
      if (gate.needsReview())
        setNotice({
          uncertain: true,
          message: "上次操作结果尚未确认，请刷新核对后再继续。",
        });
      return () => {
        gate.dispose();
        setFocus((value) => ({ ...value, active: false }));
        void queryClient.cancelQueries({ queryKey: detailKey });
        void queryClient.cancelQueries({ queryKey: commentKey });
      };
    }, [gate, queryClient, id, userId, session]),
  );
  const detail = useQuery({
    queryKey: [...detailKey, focus.revision],
    queryFn: ({ signal }) => session.readDetail(id, signal),
    enabled: focus.active,
    retry: false,
    staleTime: 0,
  });
  const ready =
    focus.active &&
    !detail.isFetching &&
    !detail.isError &&
    !!detail.data &&
    sessionEpoch() === session.epoch;
  const comments = useInfiniteQuery({
    queryKey: [...commentKey, focus.revision],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => session.comments(id, pageParam, signal),
    getNextPageParam: (page) => (page.hasNext ? page.page + 1 : undefined),
    enabled: ready,
    retry: false,
    staleTime: 0,
  });
  async function refreshCommunity() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: commentKey }),
      queryClient.invalidateQueries({ queryKey: detailKey }),
      queryClient.invalidateQueries({ queryKey: communityKeys.feeds(userId) }),
      queryClient.invalidateQueries({ queryKey: ["own-dynamics", userId] }),
    ]);
  }
  async function perform<T>(
    write: (signal: AbortSignal, attempted: () => void) => Promise<T>,
    committed: (value: T) => Promise<void> | void,
  ) {
    if (!ready) return;
    const result = await gate.run(write, committed, true);
    if (!gate.isActive() || result.status === "ignored") return;
    if (result.status === "error") {
      setNotice(result);
      setReviewed(false);
    } else setNotice(null);
  }
  async function toggleLike() {
    await perform(
      (signal, attempted) => session.toggleLike(id, signal, attempted),
      (state) => {
        queryClient.setQueriesData<DynamicDetail>(
          { queryKey: detailKey },
          (current) =>
            current
              ? {
                  ...current,
                  likedByMe: state.liked,
                  likeCount: state.likeCount,
                }
              : current,
        );
        queryClient.setQueriesData(
          { queryKey: communitySessionKeys.feeds(userId, session.epoch) },
          (value) => updateFeedLike(value, id, state.liked, state.likeCount),
        );
      },
    );
  }
  async function sendComment() {
    const content = commentText.trim();
    if (!content || Array.from(content).length > 2000) return;
    await perform(
      (signal, attempted) => session.comment(id, content, signal, attempted),
      async () => {
        setCommentText("");
        await refreshCommunity();
      },
    );
  }
  async function confirmDeletion() {
    const target = deleteTarget;
    if (target === null) return;
    await perform(
      (signal, attempted) =>
        target === "dynamic"
          ? session.remove(id, "dynamic", signal, attempted)
          : session.remove(target, "comment", signal, attempted),
      async () => {
        setDeleteTarget(null);
        if (target === "dynamic" && gate.isActive()) router.replace("/(tabs)");
        await refreshCommunity();
      },
    );
  }
  async function reviewUnconfirmed() {
    if (reviewed) {
      gate.acknowledgeReview();
      setNotice(null);
      setReviewed(false);
      return;
    }
    try {
      await Promise.all([
        detail.refetch({ throwOnError: true }),
        comments.refetch({ throwOnError: true }),
      ]);
      if (gate.isActive()) setReviewed(true);
    } catch {
      if (gate.isActive())
        setNotice({
          uncertain: true,
          message: "刷新失败，操作结果仍未确认，请稍后核对。",
        });
    }
  }
  const writeDisabled =
    !ready || busy || Boolean(notice?.uncertain || notice?.reviewRequired);
  const canLike = user?.permissionKeys.includes("community:like:toggle");
  const canComment = user?.permissionKeys.includes("community:comment:create");
  const canEdit = user?.permissionKeys.includes("community:dynamic:update-own");

  if (!focus.active || detail.isPending || detail.isFetching)
    return <State title="动态详情" message="正在加载动态" />;
  if (!detail.data || detail.isError) {
    const missing =
      detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <State
        title="动态详情"
        message={missing ? "该动态当前不可见。" : "动态加载失败，请重试。"}
        onRetry={missing ? undefined : () => void detail.refetch()}
      />
    );
  }
  const item = detail.data;
  const isOwner = user?.userId === item.author.userId;
  const commentItems =
    !comments.isError && !comments.isRefetching
      ? (comments.data?.pages.flatMap((page) => page.items) ?? [])
      : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "动态详情" }} />
      {notice ? (
        <View style={styles.loginPrompt}>
          <Text accessibilityRole="alert" style={styles.error}>
            {notice.message}
          </Text>
          {notice.uncertain || notice.reviewRequired ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void reviewUnconfirmed()}
            >
              <Text style={styles.actionText}>
                {reviewed ? "已核对，继续操作" : "刷新核对"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
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
          <Text style={styles.muted}>
            {new Date(item.createdAt).toLocaleString("zh-CN")}
          </Text>
        </View>
      </View>
      <MarkdownView source={item.content} format={item.contentFormat} images={item.bodyAssets}/>
      {item.resort ? (
        <Text style={styles.resort}>雪场 · {item.resort.name}</Text>
      ) : null}
      <View style={styles.gallery}>
        {item.imageUrls.map((url, index) => (
          <Image
            key={`${url}-${index}`}
            source={{ uri: url }}
            resizeMode="cover"
            style={styles.galleryImage}
          />
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={writeDisabled || (!!user && !canLike)}
          onPress={() => (user ? void toggleLike() : router.push("/auth"))}
          style={styles.actionButton}
        >
          <Text style={item.likedByMe ? styles.liked : styles.actionText}>
            {item.likedByMe ? "♥" : "♡"} {item.likeCount}
          </Text>
        </Pressable>
        <Text style={styles.muted}>评论 {item.commentCount}</Text>
        {isOwner && canEdit ? (
          <Pressable
            accessibilityRole="button"
            disabled={writeDisabled}
            onPress={() =>
              router.push({
                pathname: "/dynamics/create",
                params: { dynamicId: String(id) },
              } as never)
            }
          >
            <Text style={styles.actionText}>编辑</Text>
          </Pressable>
        ) : null}
        {isOwner && canEdit ? (
          <Pressable
            accessibilityRole="button"
            disabled={writeDisabled}
            onPress={() => setDeleteTarget("dynamic")}
          >
            <Text style={styles.danger}>删除</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.commentHeader}>
        <Text style={styles.sectionTitle}>评论</Text>
        <Text style={styles.muted}>{comments.data?.pages[0]?.total ?? 0}</Text>
      </View>
      {user && canComment ? (
        <View style={styles.commentComposer}>
          <TextInput
            accessibilityLabel="评论内容"
            value={commentText}
            editable={!writeDisabled}
            onChangeText={setCommentText}
            placeholder="写下评论"
            maxLength={2000}
            multiline
            style={styles.commentInput}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!commentText.trim() || writeDisabled}
            onPress={() => void sendComment()}
            style={styles.sendButton}
          >
            <Text style={styles.sendText}>{busy ? "处理中" : "发送"}</Text>
          </Pressable>
        </View>
      ) : !user ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/auth")}
          style={styles.loginPrompt}
        >
          <Text style={styles.actionText}>登录后发表评论</Text>
        </Pressable>
      ) : (
        <Text style={styles.muted}>当前账号未获评论权限。</Text>
      )}
      {comments.isPending ? <ActivityIndicator style={styles.loading} /> : null}
      {comments.isError ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void (comments.isFetchNextPageError
              ? comments.fetchNextPage()
              : comments.refetch())
          }
          style={styles.loginPrompt}
        >
          <Text style={styles.actionText}>评论加载失败，点此重试</Text>
        </Pressable>
      ) : null}
      {!comments.isPending && !comments.isError && commentItems.length === 0 ? (
        <Text style={styles.empty}>还没有评论</Text>
      ) : null}
      {commentItems.map((comment) => (
        <View key={comment.commentId} style={styles.commentRow}>
          <View style={styles.commentCopy}>
            <Text style={styles.commentAuthor}>{comment.author.nickname}</Text>
            <Text style={styles.commentBody}>{comment.content}</Text>
            <Text style={styles.muted}>
              {new Date(comment.createdAt).toLocaleString("zh-CN")}
            </Text>
          </View>
          {user?.userId === comment.author.userId && canComment ? (
            <Pressable
              accessibilityRole="button"
              disabled={
                writeDisabled || comments.isFetching || comments.isError
              }
              onPress={() => setDeleteTarget(comment.commentId)}
            >
              <Text style={styles.danger}>删除</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {comments.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          disabled={comments.isFetching}
          onPress={() => void comments.fetchNextPage()}
          style={styles.more}
        >
          <Text style={styles.actionText}>
            {comments.isFetchingNextPage ? "加载中" : "加载更多评论"}
          </Text>
        </Pressable>
      ) : null}
      {deleteTarget !== null ? (
        <View style={styles.loginPrompt}>
          <Text style={styles.muted}>
            确认删除这条{deleteTarget === "dynamic" ? "动态" : "评论"}？
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={writeDisabled}
            onPress={() => void confirmDeletion()}
          >
            <Text style={styles.danger}>确认删除</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => setDeleteTarget(null)}
          >
            <Text style={styles.actionText}>取消</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function State({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.state}>
      <Stack.Screen options={{ title }} />
      <Text style={styles.muted}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry}>
          <Text style={styles.actionText}>重试</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function updateFeedLike(
  value: unknown,
  dynamicId: number,
  liked: boolean,
  likeCount: number,
) {
  if (
    !value ||
    typeof value !== "object" ||
    !("pages" in value) ||
    !Array.isArray(value.pages)
  )
    return value;
  const data = value as {
    pages: Array<{ items: Array<Record<string, unknown>> }>;
    pageParams: unknown[];
  };
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((entry) =>
        entry.dynamicId === dynamicId
          ? { ...entry, likedByMe: liked, likeCount }
          : entry,
      ),
    })),
  };
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 36 },
  authorLine: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 42,
    minHeight: 44,
    borderRadius: 21,
    backgroundColor: colors.soft,
  },
  avatarFallback: {
    width: 42,
    minHeight: 44,
    borderRadius: 21,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: colors.primary, fontWeight: "700" },
  authorInfo: { marginLeft: 10, gap: 3 },
  author: { color: colors.text, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 13 },
  body: { color: colors.text, fontSize: 17, lineHeight: 27, marginTop: 20 },
  resort: { color: colors.primary, marginTop: 12 },
  gallery: { gap: 8, marginTop: 16 },
  galleryImage: {
    width: "100%",
    aspectRatio: 1.35,
    borderRadius: radius.md,
    backgroundColor: colors.soft,
  },
  actions: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
  },
  actionButton: { minWidth: 44, minHeight: 44, justifyContent: "center" },
  actionText: { color: colors.primary, fontWeight: "600" },
  liked: { color: colors.error, fontWeight: "700" },
  danger: { color: colors.error, fontWeight: "600" },
  commentHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginTop: 18,
  },
  sectionTitle: { color: colors.text, fontWeight: "700", fontSize: 18 },
  commentComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  sendButton: {
    minHeight: 44,
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  sendText: { color: colors.primaryText, fontWeight: "600" },
  loginPrompt: { paddingVertical: 16 },
  loading: { margin: 16 },
  empty: { color: colors.muted, paddingVertical: 18 },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
  },
  commentCopy: { flex: 1, gap: 5 },
  commentAuthor: { color: colors.text, fontWeight: "600" },
  commentBody: { color: colors.text, lineHeight: 22 },
  more: { padding: 16, alignItems: "center" },
  error: { color: colors.error, paddingVertical: 10 },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    backgroundColor: colors.background,
  },
}));
