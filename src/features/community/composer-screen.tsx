import { markdownImageIds } from "../content/markdown-model";
import { ComposerRichEditor } from "./composer-rich-editor";
import { MarkdownView } from "../content/markdown-view";
import { createThemedStyles, radius } from "../../theme";
import { Pressable } from "../../components/controls";
import { apiRequest } from "../../platform/api/api-client";
import {
  parseDynamicFieldSchema,
  initialDynamicFields,
  dynamicFieldChanges,
} from "./dynamic-fields-model";
import { DynamicFieldsForm } from "./dynamic-fields-form";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Stack,
  useLocalSearchParams,
  useRouter,
  useFocusEffect,
} from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Image, ScrollView, View } from "react-native";

import { Text } from "../../../components/Themed";
import { useAuthSession } from "../../platform/auth/session-provider";
import type { OwnDynamicDetail } from "./community-api";
import { sessionEpoch } from "../../platform/auth/secure-session";
import { communityIdentityKey } from "./community-session";
import { createComposerSession } from "./composer-session";
import { ComposerRun, type ComposerState } from "./composer-run";
import {
  composerTarget,
  MAX_COMPOSER_IMAGE_BYTES,
  COMPOSER_IMAGE_TYPES,
  type ComposerImage,
} from "./composer-model";
import {
  DynamicResortPicker,
  type SelectedResort,
} from "./dynamic-resort-picker";
const MAX_IMAGE_BYTES = MAX_COMPOSER_IMAGE_BYTES;
const ALLOWED_IMAGE_TYPES = COMPOSER_IMAGE_TYPES;
type PickedImage = ComposerImage;

export default function DynamicComposerScreen() {
  const { user, status } = useAuthSession();
  const params = useLocalSearchParams<{ dynamicId?: string }>();
  let id: number | null;
  try {
    id = composerTarget(params.dynamicId);
  } catch {
    return (
      <View>
        <Text>动态编号无效</Text>
      </View>
    );
  }
  if (status === "restoring")
    return (
      <View>
        <Text>正在恢复会话</Text>
      </View>
    );
  if (!user) return <ComposerAccess message="登录后可以发布动态" />;
  const required =
    id === null
      ? ["community:dynamic:create"]
      : ["community:dynamic:update-own", "community:dynamic:read-own"];
  if (required.some((permission) => !user.permissionKeys.includes(permission)))
    return <ComposerAccess message="当前账号没有发布或编辑权限" />;
  return (
    <DynamicComposer
      key={`${communityIdentityKey(user, sessionEpoch())}:${id ?? "new"}`}
      id={id}
    />
  );
}
function ComposerAccess({ message }: { message: string }) {
  const styles = useStyles();
  const router = useRouter();
  return (
    <View style={styles.state}>
      <Text>{message}</Text>
      <Pressable onPress={() => router.replace("/auth")}>
        <Text>前往登录</Text>
      </Pressable>
    </View>
  );
}

function DynamicComposer({ id }: { id: number | null }) {
  const styles = useStyles();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const userId = user!.userId;
  const [session] = useState(() => createComposerSession(userId, id));
  const [focus, setFocus] = useState({ active: false, revision: 0 });
  const [state, setState] = useState<ComposerState>({
    ready: false,
    busy: false,
    progress: null,
    error: null,
    outcome: "idle",
    conflict: false,
  });
  const [content, setContent] = useState("");
  const [contentFormat, setContentFormat] = useState<
    "plain_text" | "markdown_v1"
  >("plain_text");
  const [images, setImages] = useState<PickedImage[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [selectedResort, setSelectedResort] = useState<SelectedResort | null>(
    null,
  );
  const [preview, setPreview] = useState(false);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const fieldsHydrated = useRef(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const hydrated = useRef(false);
  const [run] = useState(
    () =>
      new ComposerRun(id, session, {
        changed: setState,
        saved: () => {
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: ["community-dynamics", userId],
            }),
            queryClient.invalidateQueries({
              queryKey: ["own-dynamics", userId],
            }),
            queryClient.invalidateQueries({
              queryKey: ["own-dynamic", userId, id],
            }),
            ...(id === null
              ? []
              : [
                  queryClient.invalidateQueries({
                    queryKey: ["community-dynamic", id, userId],
                  }),
                ]),
          ]).catch(() => undefined);
          router.replace("/profile/dynamics");
        },
      }),
  );
  const detailKey = ["composer-detail", userId, session.epoch, id] as const;
  useFocusEffect(
    useCallback(() => {
      run.activate();
      setFocus((value) => ({ active: true, revision: value.revision + 1 }));
      return () => {
        run.dispose();
        setFocus((value) => ({ ...value, active: false }));
        void queryClient.cancelQueries({ queryKey: detailKey });
        void queryClient.cancelQueries({
          queryKey: ["composer-fields", userId, session.epoch],
        });
        void queryClient.cancelQueries({
          queryKey: ["composer-resorts", userId, session.epoch],
        });
      };
    }, [run, queryClient, userId, session, id]),
  );
  const detail = useQuery({
    queryKey: [...detailKey, focus.revision],
    queryFn: ({ signal }) => run.load(signal),
    enabled: focus.active,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const fieldQuery = useQuery({
    queryKey: ["composer-fields", userId, session.epoch, focus.revision],
    enabled: focus.active,
    queryFn: async ({ signal }) => {
      await session.verify(signal);
      const value = parseDynamicFieldSchema(
        await apiRequest<unknown>("/me/dynamics/custom-fields", {
          signal,
          expectedSessionEpoch: session.epoch,
          cache: "no-store",
        }),
      );
      await session.verify(signal);
      return value;
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (
      focus.active &&
      !fieldQuery.isFetching &&
      !fieldQuery.isError &&
      fieldQuery.data &&
      !fieldsHydrated.current &&
      (id === null || detail.data)
    ) {
      setCustomFields(
        initialDynamicFields(
          fieldQuery.data,
          detail.data?.customFields ?? {},
          id !== null,
        ),
      );
      fieldsHydrated.current = true;
    }
  }, [
    fieldQuery.data,
    fieldQuery.isFetching,
    fieldQuery.isError,
    detail.data,
    id,
    focus.active,
  ]);
  function hydrate(value: OwnDynamicDetail) {
    if (fieldQuery.data) {
      setCustomFields(
        initialDynamicFields(fieldQuery.data, value.customFields ?? {}, true),
      );
      fieldsHydrated.current = true;
    }
    setContent(value.content);
    setContentFormat(value.contentFormat ?? "plain_text");
    setSelectedResort(value.resort);
    setImages(
      value.images.map((image, index) => ({
        kind: "existing",
        assetId: image.assetId,
        uri: image.url,
        name: `已保存图片 ${index + 1}`,
      })),
    );
    hydrated.current = true;
  }
  useEffect(() => {
    if (
      focus.active &&
      !detail.isFetching &&
      !detail.isError &&
      detail.data &&
      !hydrated.current
    )
      hydrate(detail.data);
    else if (
      focus.active &&
      !detail.isFetching &&
      !detail.isError &&
      detail.data &&
      !state.conflict
    ) {
      const urls = new Map(
        detail.data.images.map((image) => [image.assetId, image.url]),
      );
      setImages((current) =>
        current.map((image) =>
          image.kind === "existing" && urls.has(image.assetId)
            ? { ...image, uri: urls.get(image.assetId)! }
            : image,
        ),
      );
    }
  }, [
    detail.data,
    detail.isFetching,
    detail.isError,
    focus.active,
    state.conflict,
  ]);
  const ready =
    focus.active &&
    state.ready &&
    !!fieldQuery.data &&
    !fieldQuery.isFetching &&
    !fieldQuery.isError &&
    !detail.isFetching &&
    !detail.isError &&
    sessionEpoch() === session.epoch;
  const busy = state.busy;
  const unconfirmed = state.outcome !== "idle";
  const editable = ready && !busy && !unconfirmed && !state.conflict;
  function submit() {
    if (!editable || !content.trim()) return;
    if (!fieldQuery.data) return;
    let changes: Record<string, unknown>;
    try {
      changes = dynamicFieldChanges(
        fieldQuery.data,
        customFields,
        detail.data?.customFields ?? {},
      );
      setFieldError(null);
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : "字段内容无效");
      return;
    }
    void run.submit({
      customFields: changes,
      content,
      contentFormat,
      images: [...images],
      resortId: selectedResort?.resortId ?? null,
    });
  }
  async function reloadLatest() {
    const focusId = run.focusId();
    try {
      const result = await detail.refetch({ throwOnError: true });
      if (result.data && run.acceptLatest(result.data, focusId))
        hydrate(result.data);
    } catch {
      /* Query displays the failed read; the local draft is retained. */
    }
  }
  async function pickImages() {
    if (!editable || !user?.permissionKeys.includes("asset:upload")) return;
    setPickerError(null);
    await run.pick(
      async (signal) => {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        signal.throwIfAborted();
        if (!permission.granted)
          throw new Error("需要允许访问照片，才能添加动态图片。");
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: 0,
          orderedSelection: true,
          quality: 0.9,
        });
        signal.throwIfAborted();
        return result;
      },
      (result) => {
        if (result.canceled) return;
        const accepted: PickedImage[] = [],
          rejected: string[] = [];
        for (const asset of result.assets) {
          const mimeType = asset.mimeType?.toLowerCase() ?? "";
          if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
            rejected.push(
              `${asset.fileName ?? "图片"}：仅支持 JPEG、PNG 或 WebP`,
            );
            continue;
          }
          if (
            asset.fileSize != null &&
            (asset.fileSize <= 0 || asset.fileSize > MAX_IMAGE_BYTES)
          ) {
            rejected.push(`${asset.fileName ?? "图片"}：文件不能超过 10 MiB`);
            continue;
          }
          accepted.push({
            kind: "new",
            uri: asset.uri,
            name:
              asset.fileName ||
              `dynamic-${Date.now()}-${accepted.length}.${extensionFor(mimeType)}`,
            mimeType,
            size: asset.fileSize ?? null,
            file: asset.file ?? null,
          });
        }
        setImages((current) => {
          const seen = new Set(current.map((image) => image.uri));
          return [
            ...current,
            ...accepted.filter((image) => {
              if (seen.has(image.uri)) return false;
              seen.add(image.uri);
              return true;
            }),
          ];
        });
        setPickerError(rejected.join("\n") || null);
      },
    );
  }

  function uploadInlineImage(image: PickedImage) {
    if (!editable || image.kind !== "new") return;
    void run.pick(
      (signal) => session.upload(image, signal),
      (asset) => {
        if (asset.status !== "ready" || !asset.url) {
          setPickerError("图片未通过扫描，请核对媒体状态");
          return;
        }
        setImages((current) =>
          current.map((item) =>
            item.uri === image.uri
              ? {
                  kind: "existing",
                  assetId: asset.assetId,
                  uri: asset.url!,
                  name: image.name,
                }
              : item,
          ),
        );
        setPickerError(null);
      },
    );
  }
  function removeImage(uri: string) {
    if (!editable) return;
    const image = images.find((item) => item.uri === uri);
    if (contentFormat === "markdown_v1" && image?.kind === "existing") {
      try {
        if (markdownImageIds(content).includes(image.assetId)) {
          setPickerError("这张图片仍在正文中，请先删除正文中的图片再移除");
          return;
        }
      } catch {
        setPickerError("正文结构无法解析，请先修正 Markdown");
        return;
      }
    }
    setImages((current) => current.filter((image) => image.uri !== uri));
  }

  function moveImage(index: number, offset: number) {
    if (!editable) return;
    setImages((current) => {
      const next = [...current];
      const target = index + offset;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  if (
    !focus.active ||
    detail.isPending ||
    detail.isFetching ||
    fieldQuery.isPending ||
    fieldQuery.isFetching
  )
    return (
      <View style={styles.state}>
        <Text>正在核对发布账号与动态</Text>
      </View>
    );
  if (detail.isError || fieldQuery.isError)
    return (
      <View style={styles.state}>
        <Text>动态或权限读取失败，请重试。</Text>
        <Pressable
          onPress={() => {
            void detail.refetch();
            void fieldQuery.refetch();
          }}
        >
          <Text>重试</Text>
        </Pressable>
      </View>
    );
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{ title: id === null ? "发布动态" : "编辑动态" }}
      />
      {state.conflict ? (
        <View>
          <Text style={styles.error}>
            动态已更新。重新载入将替换当前未保存的草稿。
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void reloadLatest()}
          >
            <Text style={styles.action}>重新载入最新内容</Text>
          </Pressable>
        </View>
      ) : null}
      <ComposerRichEditor
        value={content}
        onChange={setContent}
        format={contentFormat}
        onFormatChange={setContentFormat}
        editable={editable}
        images={images.flatMap((image) =>
          image.kind === "existing"
            ? [{ assetId: image.assetId, url: image.uri }]
            : [],
        )}
      />
      {
        <View style={styles.imagesSection}>
          <View style={styles.imagesHeading}>
            <Text style={styles.imagesTitle}>图片 {images.length} 张</Text>
            <Pressable
              accessibilityRole="button"
              disabled={
                !editable || !user?.permissionKeys.includes("asset:upload")
              }
              onPress={() => void pickImages()}
              style={styles.addImageButton}
            >
              <Text style={styles.action}>
                {busy ? "正在选择" : "选择图片"}
              </Text>
            </Pressable>
          </View>
          {images.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.imageStrip}
            >
              {images.map((image, index) => (
                <View key={image.uri} style={styles.imageItem}>
                  <Image source={{ uri: image.uri }} style={styles.thumbnail} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`移除${image.name}`}
                    disabled={!editable}
                    onPress={() => removeImage(image.uri)}
                    style={styles.removeImage}
                  >
                    <Text style={styles.removeImageText}>×</Text>
                  </Pressable>
                  {contentFormat === "markdown_v1" && image.kind === "new" ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={!editable}
                      onPress={() => uploadInlineImage(image)}
                    >
                      <Text style={styles.action}>上传以插入正文</Text>
                    </Pressable>
                  ) : null}
                  <Text numberOfLines={1} style={styles.fileName}>
                    {index + 1}. {image.name}
                  </Text>
                  <View style={styles.reorderActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`将第${index + 1}张图片前移`}
                      disabled={!editable || index === 0}
                      onPress={() => moveImage(index, -1)}
                      style={styles.orderButton}
                    >
                      <Text style={index === 0 ? styles.muted : styles.action}>
                        前移
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`将第${index + 1}张图片后移`}
                      disabled={!editable || index === images.length - 1}
                      onPress={() => moveImage(index, 1)}
                      style={styles.orderButton}
                    >
                      <Text
                        style={
                          index === images.length - 1
                            ? styles.muted
                            : styles.action
                        }
                      >
                        后移
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.muted}>
              可继续添加图片，每张不超过 10 MiB。
            </Text>
          )}
          {pickerError ? <Text style={styles.error}>{pickerError}</Text> : null}
        </View>
      }
      {user ? (
        <DynamicResortPicker
          userId={user.userId}
          epoch={session.epoch}
          focusRevision={focus.revision}
          value={selectedResort}
          onChange={setSelectedResort}
          disabled={!editable}
          canClear
        />
      ) : null}
      {fieldQuery.data ? (
        <DynamicFieldsForm
          schema={fieldQuery.data}
          values={customFields}
          onChange={setCustomFields}
          disabled={!editable}
        />
      ) : null}
      {fieldError ? <Text style={styles.error}>{fieldError}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: preview }}
        onPress={() => setPreview(!preview)}
        style={styles.previewButton}
      >
        <Text style={styles.action}>
          {preview ? "收起预览" : "查看动态预览"}
        </Text>
      </Pressable>
      {preview ? (
        <View style={styles.preview}>
          <Text style={styles.imagesTitle}>{user?.nickname}</Text>
          <MarkdownView
            source={content.trim() || "尚未填写正文"}
            format={contentFormat}
            images={images.flatMap((image) =>
              image.kind === "existing"
                ? [{ assetId: image.assetId, url: image.uri }]
                : [],
            )}
          />
          {selectedResort ? (
            <Text style={styles.action}>雪场：{selectedResort.name}</Text>
          ) : null}
          <ScrollView horizontal contentContainerStyle={styles.imageStrip}>
            {images
              .map((image) => image.uri)
              .map((uri, index) => (
                <Image
                  key={`${index}:${uri}`}
                  source={{ uri }}
                  style={styles.thumbnail}
                />
              ))}
          </ScrollView>
        </View>
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.counter}>{Array.from(content).length}/10000</Text>
        <Pressable
          accessibilityRole="button"
          disabled={
            !content.trim() ||
            Array.from(content.trim()).length > 10000 ||
            !editable ||
            (id !== null &&
              (!detail.data ||
                detail.isError ||
                detail.data.author.userId !== user?.userId))
          }
          onPress={submit}
          style={styles.submit}
        >
          <Text style={styles.submitText}>
            {state.busy
              ? (state.progress ?? "提交中")
              : id === null
                ? "发布"
                : "保存"}
          </Text>
        </Pressable>
      </View>
      {unconfirmed ? (
        <View>
          <Text style={styles.error}>
            {state.outcome === "confirmed"
              ? "提交已完成，请到我的动态查看。"
              : "尚未确认提交结果，请先到我的动态查看，避免重复提交。"}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/profile/dynamics")}
            style={styles.previewButton}
          >
            <Text style={styles.action}>前往我的动态核对</Text>
          </Pressable>
        </View>
      ) : state.error ? (
        <Text style={styles.error}>{state.error}</Text>
      ) : null}
      {id !== null && detail.data?.status === "published" ? (
        <Text style={styles.notice}>保存后动态将进入重新审核状态。</Text>
      ) : null}
      {id !== null &&
      detail.data &&
      detail.data.imageCount > detail.data.images.length ? (
        <Text style={styles.notice}>
          部分原图片不可用，保存后仅保留当前显示的图片。
        </Text>
      ) : null}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, flexGrow: 1 },
  input: {
    minHeight: 240,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  imagesSection: { marginTop: 18 },
  reorderActions: { flexDirection: "row", justifyContent: "space-between" },
  orderButton: { minHeight: 44, justifyContent: "center" },
  previewButton: { minHeight: 44, justifyContent: "center", marginTop: 12 },
  preview: {
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  previewContent: { color: colors.text, fontSize: 15, lineHeight: 24 },
  imagesHeading: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  imagesTitle: { color: colors.text, fontWeight: "600" },
  addImageButton: {
    minWidth: 82,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 10,
  },
  imageStrip: { gap: 10, paddingVertical: 8 },
  imageItem: { width: 104 },
  thumbnail: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    backgroundColor: colors.soft,
  },
  removeImage: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "rgba(32,40,33,0.82)",
  },
  removeImageText: { color: colors.primaryText, fontSize: 20, lineHeight: 22 },
  fileName: { color: colors.muted, fontSize: 13, marginTop: 4 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  counter: { color: colors.muted, fontSize: 13 },
  submit: {
    minWidth: 140,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  submitText: { color: colors.primaryText, fontWeight: "700" },
  error: { color: colors.error, marginTop: 12 },
  notice: { color: colors.muted, marginTop: 12 },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    backgroundColor: colors.background,
  },
  muted: { color: colors.muted },
  action: { color: colors.primary, fontWeight: "600" },
}));

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}
