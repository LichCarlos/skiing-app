import { Text } from "../../../components/Themed";
import { ActivityIndicator, Pressable } from "../../components/controls";
import { Link, type Href } from "expo-router";
import { View } from "react-native";
import { aiErrorMessage, citationRoute, type AiMessage } from "./ai-api";
import { ApiError } from "../../platform/api/api-error";
import { useAiStyles } from "./ai-ui";
import { visibleConfirmedTurns, type AiRunState } from "./conversation-run";

export function ConversationTimeline({
  messages,
  loading,
  loadError,
  state,
  onReload,
  onRetry,
  onEdit,
  onStop,
}: {
  messages?: readonly AiMessage[];
  loading: boolean;
  loadError: unknown;
  state: AiRunState;
  onReload: () => void;
  onRetry: () => void;
  onEdit: () => void;
  onStop: () => void;
}) {
  const s = useAiStyles();
  const confirmed = visibleConfirmedTurns(state.confirmed, messages ?? []);
  const { pending, partial, sending, error } = state;
  const denied =
    state.denied ||
    (loadError instanceof ApiError &&
      [401, 403, 404].includes(loadError.status));
  return (
    <>
      {loading && <ActivityIndicator accessibilityLabel="加载对话" />}
      {loadError !== null && (
        <View style={s.state}>
          <Text style={s.error}>{aiErrorMessage(loadError)}</Text>
          <Pressable accessibilityRole="button" onPress={onReload}>
            <Text style={s.link}>重新加载</Text>
          </Pressable>
        </View>
      )}
      {messages?.length === 0 &&
        !pending &&
        !confirmed.length &&
        loadError === null && (
          <Text style={s.muted}>
            可以问：“第一次滑雪需要准备什么？”追问时请写明具体雪场或主题。
          </Text>
        )}
      {!denied &&
        messages?.map((message) => (
          <Message key={message.messageId} message={message} />
        ))}
      {!denied &&
        confirmed.map((turn) => (
          <View key={turn.message.messageId}>
            <View style={[s.card, s.userCard]}>
              <Text style={s.muted}>本轮提问</Text>
              <Text style={s.body}>{turn.request.content}</Text>
            </View>
            <Message message={turn.message} />
          </View>
        ))}
      {!denied && pending && (
        <View style={s.card}>
          <Text style={s.muted}>本轮提问</Text>
          <Text style={s.body}>{pending.content}</Text>
          {!!partial && (
            <Text selectable style={s.body}>
              {partial}
            </Text>
          )}
          <Text style={s.muted}>
            {sending ? "正在生成，完成后保存回答…" : "回答尚未确认完成。"}
          </Text>
          {!sending && (
            <>
              <Pressable accessibilityRole="button" onPress={onRetry}>
                <Text style={s.link}>使用原请求重试</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onEdit}>
                <Text style={s.link}>编辑后重新提问</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {sending && (
        <Pressable accessibilityRole="button" onPress={onStop}>
          <Text style={s.link}>停止回答</Text>
        </Pressable>
      )}
    </>
  );
}

function Message({ message }: { message: AiMessage }) {
  const s = useAiStyles();
  return (
    <View style={[s.card, message.role === "user" && s.userCard]}>
      <Text style={s.muted}>{message.role === "user" ? "我" : "滑雪 AI"}</Text>
      <Text selectable style={s.body}>
        {message.content}
      </Text>
      <Text style={s.muted}>
        {new Date(message.createdAt).toLocaleString("zh-CN")}
      </Text>
      {message.citations.map((citation, index) => {
        const href = citationRoute(citation);
        return (
          <View key={`${citation.sourceType}:${citation.sourceId}:${index}`}>
            {href ? (
              <Link href={href as Href} style={s.link}>
                [S{index + 1}] {citation.title}
              </Link>
            ) : (
              <Text style={s.muted}>
                [S{index + 1}] {citation.title}
              </Text>
            )}
            <Text selectable style={s.muted}>
              {citation.excerpt}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
