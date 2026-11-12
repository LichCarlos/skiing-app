import { MarkdownView } from "../content/markdown-view";
import { Text } from "../../../components/Themed";
import { ActivityIndicator, Pressable } from "../../components/controls";
import { Link } from "expo-router";
import { Image, ScrollView, View } from "react-native";
import type { OwnDynamicDetail } from "./community-api";
import type { OwnDynamicState } from "./own-dynamic-run";
import {
  dynamicStatusLabels,
  ownDynamicError,
  useOwnStyles,
} from "./own-dynamics-ui";

interface Props {
  id: number;
  state: OwnDynamicState;
  item?: OwnDynamicDetail;
  error: unknown;
  loading: boolean;
  fetching: boolean;
  confirmDelete: boolean;
  canWrite: boolean;
  onReload: () => void;
  onReviewed: () => void;
  onDelete: () => void;
  onConfirm: (value: boolean) => void;
}
export function OwnDynamicDetailView({
  id,
  state,
  item: input,
  error,
  loading,
  fetching,
  confirmDelete,
  canWrite,
  onReload,
  onReviewed,
  onDelete,
  onConfirm,
}: Props) {
  const s = useOwnStyles();
  const item =
    state.ready && !loading && !fetching && error === null ? input : undefined;
  const disabled = !item || state.busy || state.uncertain || fetching;
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      {state.error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {state.error}
        </Text>
      ) : null}
      {state.busy ? <Text style={s.muted}>正在核对并删除…</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={state.busy || fetching}
        onPress={() => {
          onReload();
        }}
      >
        <Text style={s.link}>刷新并核对动态</Text>
      </Pressable>
      {state.uncertain && state.reviewed ? (
        <Pressable accessibilityRole="button" onPress={onReviewed}>
          <Text style={s.link}>已核对动态仍存在，允许重新操作</Text>
        </Pressable>
      ) : null}
      {loading ? (
        <ActivityIndicator accessibilityLabel="正在加载动态" />
      ) : error !== null ? (
        <View>
          <Text style={s.error}>{ownDynamicError(error)}</Text>
          <Pressable accessibilityRole="button" onPress={onReload}>
            <Text style={s.link}>重试</Text>
          </Pressable>
        </View>
      ) : item ? (
        <>
          <Text style={s.title}>{dynamicStatusLabels[item.status]}</Text>
          <Text style={s.muted}>
            发布于 {new Date(item.createdAt).toLocaleString("zh-CN")} · 更新于{" "}
            {new Date(item.updatedAt).toLocaleString("zh-CN")}
          </Text>
          <MarkdownView source={item.content} format={item.contentFormat} images={item.bodyAssets}/>
          {item.imageUrls.map((url, index) => (
            <Image
              key={`${index}:${url}`}
              source={{ uri: url }}
              style={s.image}
              accessibilityLabel={`动态图片 ${index + 1}`}
              resizeMode="contain"
            />
          ))}
          <Text style={s.muted}>
            {item.likeCount} 赞 · {item.commentCount} 条评论
            {item.resort ? ` · ${item.resort.name}` : ""}
          </Text>
          {item.status === "published" && (
            <Link
              href={{
                pathname: "/dynamics/[dynamicId]",
                params: { dynamicId: id },
              }}
              style={s.link}
            >
              查看公开动态与评论
            </Link>
          )}
          {!disabled && canWrite && (
            <Link
              href={{ pathname: "/dynamics/create", params: { dynamicId: id } }}
              style={s.link}
            >
              编辑动态
            </Link>
          )}
          {canWrite &&
            (confirmDelete ? (
              <View style={s.card}>
                <Text style={s.body}>
                  确认删除这条动态？删除后将从本人列表和公开页面隐藏。
                </Text>
                <View style={s.row}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={disabled}
                    onPress={onDelete}
                  >
                    <Text style={s.error}>
                      {state.busy ? "删除中…" : "确认删除"}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={state.busy}
                    onPress={() => onConfirm(false)}
                  >
                    <Text style={s.link}>取消</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => onConfirm(true)}
              >
                <Text style={s.error}>删除动态</Text>
              </Pressable>
            ))}
        </>
      ) : null}
      <Link href="/profile/dynamics" style={s.link}>
        返回我的动态
      </Link>
    </ScrollView>
  );
}
