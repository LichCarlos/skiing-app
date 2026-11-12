import { Text } from "../../../components/Themed";
import { ActivityIndicator, Pressable } from "../../components/controls";
import { Link, type Href } from "expo-router";
import { ScrollView, View } from "react-native";
import type { AiConversationPage } from "./ai-api";
import { aiConversationId } from "./conversation-run";
import {
  aiListErrorMessage,
  lastConversationPage,
  type AiListState,
} from "./conversation-list-run";
import { useAiStyles } from "./ai-ui";

interface Props {
  state: AiListState;
  data?: AiConversationPage;
  error: unknown;
  loading: boolean;
  fetching: boolean;
  page: number;
  deleteId: string | null;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onConfirm: (id: string | null) => void;
  onPage: (page: number) => void;
  onReload: () => void;
  onReviewed: () => void;
}
export function ConversationListView(props: Props) {
  const s = useAiStyles();
  const { state, error, data, page, deleteId } = props;
  const visible = state.ready && !error && data?.page === page;
  const disabled =
    !!state.busy || state.uncertain || !visible || props.fetching;
  const pages = lastConversationPage(data?.total ?? 0, data?.pageSize ?? 20);
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <Text style={s.title}>雪上问题，一起解答</Text>
      <Text style={s.muted}>
        围绕雪场、滑雪知识和平台公开资料提问，回答附带可核对的来源。追问时请写明雪场或知识主题，便于准确查找资料。
      </Text>
      <Action disabled={disabled} onPress={props.onCreate} primary>
        {state.busy === "create" ? "正在创建…" : "新建对话"}
      </Action>
      {state.error && (
        <Text accessibilityRole="alert" style={s.error}>
          {state.error}
        </Text>
      )}
      <Action
        disabled={!!state.busy || props.fetching}
        onPress={props.onReload}
      >
        {props.fetching ? "正在刷新…" : "刷新列表"}
      </Action>
      {state.uncertain && (
        <View style={s.card}>
          {state.busy && (
            <Text style={s.muted}>
              上次请求仍在结束，请稍候，结束后刷新列表再核对。
            </Text>
          )}
          <Text style={s.muted}>
            刷新后请核对各页会话。列表暂未出现记录，也可能是操作仍未完成；继续新建可能产生重复会话。
          </Text>
          <Action
            disabled={
              !!state.busy || !state.reviewed || !visible || props.fetching
            }
            onPress={props.onReviewed}
          >
            已核对列表，继续操作
          </Action>
        </View>
      )}
      {error ? (
        <View style={s.state}>
          <Text accessibilityRole="alert" style={s.error}>
            {aiListErrorMessage(error)}
          </Text>
        </View>
      ) : props.loading || (!visible && props.fetching) ? (
        <ActivityIndicator accessibilityLabel="加载会话" />
      ) : !visible ? (
        <Text style={s.muted}>请刷新列表后继续。</Text>
      ) : (
        <>
          {!data.items.length && (
            <Text style={s.muted}>暂无对话，点击上方开始。</Text>
          )}
          {data.items.map((item) => {
            const id = aiConversationId(item.conversationId);
            return (
              <View key={item.conversationId} style={s.card}>
                {id && !state.busy ? (
                  <Link href={`/ai/${id}` as Href} style={s.body}>
                    {item.title || "新对话"}
                  </Link>
                ) : (
                  <Text style={s.body}>{item.title || "新对话"}</Text>
                )}
                <Text style={s.muted}>
                  {new Date(item.updatedAt).toLocaleString("zh-CN")} ·{" "}
                  {item.messageCount} 条消息
                </Text>
                {deleteId === item.conversationId ? (
                  <View style={s.row}>
                    <Text style={s.muted}>删除后此会话将从列表隐藏。</Text>
                    <Action
                      disabled={disabled || !id}
                      onPress={() => props.onDelete(item.conversationId)}
                    >
                      {state.busy === "delete" ? "删除中…" : "确认删除"}
                    </Action>
                    <Action
                      disabled={!!state.busy}
                      onPress={() => props.onConfirm(null)}
                    >
                      取消
                    </Action>
                  </View>
                ) : (
                  <Action
                    disabled={disabled || !id}
                    onPress={() => props.onConfirm(item.conversationId)}
                  >
                    删除会话
                  </Action>
                )}
              </View>
            );
          })}
          <View style={s.row}>
            <Action
              disabled={!!state.busy || props.fetching || page <= 1}
              onPress={() => props.onPage(page - 1)}
            >
              上一页
            </Action>
            <Text style={s.muted}>
              {page} / {pages}
            </Text>
            <Action
              disabled={!!state.busy || props.fetching || page >= pages}
              onPress={() => props.onPage(page + 1)}
            >
              下一页
            </Action>
          </View>
        </>
      )}
    </ScrollView>
  );
}
function Action({
  disabled,
  onPress,
  primary,
  children,
}: {
  disabled: boolean;
  onPress: () => void;
  primary?: boolean;
  children: string;
}) {
  const s = useAiStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={primary ? s.button : undefined}
    >
      <Text style={primary ? s.buttonText : s.link}>{children}</Text>
    </Pressable>
  );
}
