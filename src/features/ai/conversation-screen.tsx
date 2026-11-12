import { Text } from "../../../components/Themed";
import { Pressable, TextInput } from "../../components/controls";
import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useFocusEffect } from "expo-router";
import { uuid } from "expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthSession } from "../../platform/auth/session-provider";
import { aiKeys, createAiSession } from "./ai-session";
import { sessionEpoch } from "../../platform/auth/secure-session";
import {
  AiConversationRun,
  aiConversationId,
  type AiRunState,
} from "./conversation-run";
import { ConversationTimeline } from "./conversation-timeline";
import { AiAccess, useAiStyles } from "./ai-ui";
import { aiTurnRecoveryFor } from "./turn-recovery";

export default function AiConversationScreen() {
  const s = useAiStyles();
  const { conversationId } = useLocalSearchParams<{
    conversationId: string | string[];
  }>();
  const { user } = useAuthSession();
  const id = aiConversationId(conversationId);
  return (
    <>
      <Stack.Screen options={{ title: "滑雪 AI 对话" }} />
      <AiAccess epoch={sessionEpoch()}>
        {id !== null ? (
          <Conversation key={`${user?.userId}:${id}`} id={id} />
        ) : (
          <Text style={s.error}>无效的会话地址。</Text>
        )}
      </AiAccess>
    </>
  );
}

function Conversation({ id }: { id: string }) {
  const s = useAiStyles();
  const { user } = useAuthSession();
  const cache = useQueryClient();
  const userId = user!.userId;
  const [session] = useState(() => createAiSession(userId));
  const [focus, setFocus] = useState({ active: false, revision: 0 });
  const queryKey = aiKeys.detail(userId, session.epoch, id);
  const query = useQuery({
    queryKey: [...queryKey, focus.revision],
    queryFn: ({ signal }) => session.read(id, signal),
    enabled: focus.active,
    retry: false,
    staleTime: 0,
  });
  const [content, setContent] = useState("");
  const [state, setState] = useState<AiRunState>({
    pending: null,
    partial: "",
    sending: false,
    error: null,
    confirmed: [],
  });
  const [run] = useState(
    () =>
      new AiConversationRun(
        {
          requestId: () => uuid.v4(),
          verify: session.verify,
          send: (request, delta, signal) =>
            session.send(id, request, delta, signal),
          changed: setState,
          confirmed: () => {
            void Promise.all([
              cache.invalidateQueries({ queryKey }),
              cache.invalidateQueries({
                queryKey: aiKeys.list(userId, session.epoch),
              }),
            ]).catch(() => undefined);
          },
        },
        aiTurnRecoveryFor(cache, userId, id),
      ),
  );
  const { pending, sending } = state;
  useFocusEffect(
    useCallback(() => {
      run.activate();
      setFocus((value) => ({ active: true, revision: value.revision + 1 }));
      return () => {
        run.dispose();
        setFocus((value) => ({ ...value, active: false }));
        void cache.cancelQueries({
          queryKey: aiKeys.detail(userId, session.epoch, id),
        });
      };
    }, [run, cache, userId, session, id]),
  );
  useEffect(() => {
    if (focus.active && !query.isFetching && !query.isError)
      run.observeHistory(query.data?.messages ?? []);
  }, [
    run,
    query.data?.messages,
    focus.active,
    query.isFetching,
    query.isError,
  ]);
  const ready =
    focus.active &&
    !query.isFetching &&
    !query.isError &&
    !!query.data &&
    !state.denied;
  async function send() {
    if (
      !ready ||
      sessionEpoch() !== session.epoch ||
      query.data?.status !== "active"
    )
      return;
    const result = run.send(content);
    if (run.snapshot().sending) setContent("");
    await result;
  }
  if (!focus.active)
    return (
      <View style={s.state}>
        <Text>正在准备对话…</Text>
      </View>
    );
  return (
    <SafeAreaView edges={["bottom"]} style={s.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          <ConversationTimeline
            messages={ready ? query.data?.messages : undefined}
            loading={query.isPending || query.isFetching}
            loadError={query.isError ? query.error : null}
            state={
              ready
                ? state
                : { ...state, pending: null, partial: "", confirmed: [] }
            }
            onReload={() => {
              if (!sending) void query.refetch();
            }}
            onRetry={() => {
              if (ready && query.data?.status === "active") void run.retry();
            }}
            onEdit={() => {
              const text = ready ? run.edit() : null;
              if (text !== null) setContent(text);
            }}
            onStop={() => run.stop()}
          />
        </ScrollView>
        <View style={s.content}>
          {ready && query.data?.status === "archived" && (
            <Text style={s.muted}>此会话已归档，仅可查看历史消息。</Text>
          )}
          <TextInput
            accessibilityLabel="提问内容"
            placeholder="请输入滑雪问题"
            multiline
            value={content}
            onChangeText={setContent}
            editable={
              ready && query.data?.status === "active" && !sending && !pending
            }
            style={s.input}
          />
          <Text style={s.muted}>
            {Array.from(content).length}/4000 · 每分钟最多 5 条新消息
          </Text>
          {Array.from(content.trim()).length > 4000 && (
            <Text style={s.error}>问题不能超过 4000 字符。</Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                sending ||
                !!pending ||
                !content.trim() ||
                Array.from(content.trim()).length > 4000 ||
                !ready ||
                query.data?.status !== "active",
            }}
            disabled={
              sending ||
              !!pending ||
              !content.trim() ||
              Array.from(content.trim()).length > 4000 ||
              !ready ||
              query.data?.status !== "active"
            }
            style={s.button}
            onPress={() => void send()}
          >
            <Text style={s.buttonText}>{sending ? "正在回答…" : "发送"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
