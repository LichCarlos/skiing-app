import { Text } from "../../../components/Themed";
import { createThemedStyles, radius } from "../../theme";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
} from "../../components/controls";
import { useCallback, useState } from "react";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Image, ScrollView, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "../../platform/auth/session-provider";
import { sessionEpoch } from "../../platform/auth/secure-session";
import { readProfileContext, updateProfile, uploadAvatar } from "./profile-api";
import { ProfileRun } from "./profile-run";
import { validateAvatar } from "./profile-submission";
import { createImageUploadForm } from "../../platform/api/image-upload-form";

type PickedAvatar = {
  uri: string;
  name: string;
  mimeType: string;
  file: Blob | null;
};
async function pickAvatar(signal: AbortSignal): Promise<PickedAvatar | null> {
  signal.throwIfAborted();
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  signal.throwIfAborted();
  if (!permission.granted) throw new Error("请允许访问相册后选择头像");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    quality: 0.9,
  });
  signal.throwIfAborted();
  if (result.canceled || !result.assets[0]) return null;
  const image = result.assets[0],
    mimeType = image.mimeType?.toLowerCase() ?? "";
  validateAvatar(mimeType, image.fileSize ?? image.file?.size ?? null);
  return {
    uri: image.uri,
    name: image.fileName ?? "avatar",
    mimeType,
    file: image.file ?? null,
  };
}
export default function ProfileScreen() {
  const { user, status } = useAuthSession();
  const key = JSON.stringify([
    user?.userId,
    user?.account,
    status,
    [...(user?.permissionKeys ?? [])].sort(),
    sessionEpoch(),
  ]);
  return <ProfileWorkspace key={key} />;
}
function ProfileWorkspace() {
  const styles = useStyles();
  const session = useAuthSession(),
    { user, status } = session;
  const router = useRouter(),
    cache = useQueryClient();
  const [epoch] = useState(sessionEpoch);
  const [active, setActive] = useState(false);
  const [run] = useState(() => {
    const expected = {
      userId: user?.userId ?? 0,
      account: user?.account ?? "",
    };
    return new ProfileRun<PickedAvatar>(expected, {
      read: (signal) => readProfileContext(expected, { epoch, signal }),
      pick: pickAvatar,
      upload: (image, signal) => {
        return uploadAvatar(createImageUploadForm(image), { epoch, signal });
      },
      patch: (body, signal) => updateProfile(body, { epoch, signal }, expected),
      saved: async (profile, signal) => {
        if (signal.aborted || sessionEpoch() !== epoch) return;
        session.applyProfile(profile);
        await cache.invalidateQueries({
          predicate: (query) =>
            !signal.aborted &&
            sessionEpoch() === epoch &&
            [
              "community-dynamics",
              "community-dynamic",
              "community-comments",
              "dynamic-comments",
              "own-dynamics",
              "own-dynamic",
            ].includes(String(query.queryKey[0])),
        });
        if (!signal.aborted && sessionEpoch() === epoch)
          router.replace("/(tabs)/profile");
      },
      changed: (value) => setState(value),
    });
  });
  const [state, setState] = useState(() => run.snapshot());
  const authenticated = !!user && status === "authenticated";
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      run.activate();
      if (authenticated) void run.reload();
      return () => {
        run.dispose();
        setActive(false);
      };
    }, [run, authenticated]),
  );
  const editable =
    state.loaded &&
    !!state.profile?.canEdit &&
    !state.busy &&
    !state.needsReview;
  const avatarUrl =
    state.avatar.kind === "new"
      ? state.avatar.image.uri
      : state.avatar.kind === "clear"
        ? null
        : state.profile?.avatarUrl;
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: "编辑资料" }} />
      {!active || status === "restoring" ? (
        <ActivityIndicator accessibilityLabel="正在确认资料" />
      ) : !user ? (
        <>
          <Text style={styles.body}>登录后可编辑资料</Text>
          {session.restoreError && (
            <Text accessibilityRole="alert">{session.restoreError}</Text>
          )}
          <Action label="前往登录" onPress={() => router.replace("/auth")} />
        </>
      ) : (
        <>
          {state.loaded && state.profile ? (
            <>
              <Text style={styles.body}>账号：{state.profile.account}</Text>
              <View style={styles.avatar}>
                {avatarUrl ? (
                  <Image
                    key={avatarUrl}
                    source={{ uri: avatarUrl }}
                    style={styles.image}
                  />
                ) : (
                  <Text>未设置头像</Text>
                )}
              </View>
              {!state.profile.canEdit && (
                <Text style={styles.body}>当前账号没有编辑资料的权限。</Text>
              )}
              <Text style={styles.body}>
                头像支持 JPEG / PNG / WebP，最大 10 MiB
              </Text>
              {!state.profile.canUpload && (
                <Text style={styles.body}>当前账号没有上传新头像的权限。</Text>
              )}
              <Action
                label="选择头像"
                disabled={!editable || !state.profile.canUpload}
                onPress={() => void run.pick()}
              />
              <Action
                label="清除头像"
                disabled={!editable}
                onPress={() => run.setAvatar("clear")}
              />
              <Action
                label="还原原头像"
                disabled={!editable}
                onPress={() => run.setAvatar("keep")}
              />
              <Text style={styles.body}>昵称（1–50 字）</Text>
              <TextInput
                accessibilityLabel="昵称"
                value={state.nickname}
                onChangeText={(value) => run.setNickname(value)}
                editable={editable}
                style={styles.input}
              />
              <Action
                label="保存资料"
                disabled={!editable}
                onPress={() => void run.save()}
              />
            </>
          ) : (
            <Text style={styles.body}>请读取最新资料后编辑。</Text>
          )}
          {state.notice && (
            <Text accessibilityRole="alert" style={styles.body}>
              {state.notice}
            </Text>
          )}
          {state.busy && (
            <ActivityIndicator accessibilityLabel="正在处理资料" />
          )}
          <Action
            label="刷新最新资料"
            disabled={state.busy}
            onPress={() => void run.reload()}
          />
          {state.needsReview && state.reviewed && (
            <Action
              label="我已核对，重新编辑"
              disabled={state.busy}
              onPress={() => run.acknowledge()}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}
function Action({
  label,
  disabled = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress(this: void): void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.body}>{label}</Text>
    </Pressable>
  );
}
const useStyles = createThemedStyles((colors) => ({
  page: {
    padding: 24,
    gap: 16,
    flexGrow: 1,
    backgroundColor: colors.background,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  body: { color: colors.text, lineHeight: 22 },
  avatar: { alignItems: "center", justifyContent: "center", minHeight: 96 },
  image: { width: 96, height: 96, borderRadius: 48 },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  button: {
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    padding: 12,
  },
  disabled: { opacity: 0.5 },
}));
