import { Text } from "../../../components/Themed";
import { createThemedStyles, radius } from "../../theme";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
} from "../../components/controls";
import { useCallback, useState } from "react";
import Constants from "expo-constants";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { ScrollView, View } from "react-native";
import { useAuthSession } from "../../platform/auth/session-provider";
import { sessionEpoch } from "../../platform/auth/secure-session";
import { SiteInfoLinks } from "../site-config/policy-screen";
import {
  changeOwnPassword,
  finishSettingsSession,
  verifySettingsAccount,
} from "./settings-api";
import { SettingsRun, type SettingsState } from "./settings-run";

export default function SettingsScreen() {
  const { user, status } = useAuthSession();
  const key = JSON.stringify([
    user?.userId,
    status,
    [...(user?.permissionKeys ?? [])].sort(),
    sessionEpoch(),
  ]);
  return <SettingsWorkspace key={key} />;
}
function SettingsWorkspace() {
  const styles = useStyles();
  const router = useRouter();
  const session = useAuthSession();
  const { user, status, restoreError } = session;
  const [expectedEpoch] = useState(sessionEpoch);
  const [active, setActive] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);
  const [state, setState] = useState<SettingsState>({
    busy: false,
    unknown: false,
    confirmed: false,
    message: null,
    errors: {},
  });
  const [run] = useState(
    () =>
      new SettingsRun({
        verify: (signal) =>
          user
            ? verifySettingsAccount(user.userId, expectedEpoch, signal)
            : Promise.reject(new Error("Login required")),
        write: (body, signal) => changeOwnPassword(body, expectedEpoch, signal),
        finish: (mode) =>
          finishSettingsSession(mode, expectedEpoch, {
            logout: () => session.signOut(),
            navigate: (outcome) => {
              if (outcome === "logout") router.replace("/(tabs)/profile");
              else
                router.replace({
                  pathname: "/auth",
                  params: {
                    notice:
                      outcome === "changed"
                        ? "password-changed"
                        : "password-unconfirmed",
                  },
                });
            },
          }),
        changed: setState,
      }),
  );
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      run.activate();
      return () => {
        run.dispose();
        setActive(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setConfirmExit(false);
      };
    }, [run]),
  );
  const canChange = !!user?.permissionKeys.includes("account:password:update");
  const disabled = state.busy || state.unknown || state.confirmed;
  function submit() {
    if (!active || disabled || !canChange) return;
    const input = { currentPassword, newPassword, confirmPassword };
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    void run.submit(input);
  }
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: "账号设置" }} />
      {!active || status === "restoring" ? (
        <ActivityIndicator accessibilityLabel="正在确认账号设置" />
      ) : !user ? (
        <>
          <Text style={styles.title}>账号设置</Text>
          <Text style={styles.body}>登录后可以管理账号密码。</Text>
          {restoreError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {restoreError}
            </Text>
          ) : null}
          <Action label="前往登录" onPress={() => router.replace("/auth")} />
          <SiteInfoLinks />
        </>
      ) : (
        <>
          <Text style={styles.title}>账号设置</Text>
          <Text style={styles.body}>昵称：{user.nickname}</Text>
          <Text style={styles.body}>账号：{user.account}</Text>
          <Text style={styles.body}>
            应用版本：{Constants.expoConfig?.version ?? "未知"}
          </Text>
          {canChange ? (
            <View style={styles.section}>
              <Text style={styles.heading}>修改密码</Text>
              <Text style={styles.body}>
                新密码为8–72个UTF-8字节，保留空格且不能与当前密码相同。成功后全部登录会话将退出。
              </Text>
              <PasswordInput
                label="当前密码"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                error={state.errors.currentPassword}
                editable={!disabled}
              />
              <PasswordInput
                label="新密码"
                value={newPassword}
                onChangeText={setNewPassword}
                error={state.errors.newPassword}
                editable={!disabled}
                isNew
              />
              <PasswordInput
                label="确认新密码"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={state.errors.confirmPassword}
                editable={!disabled}
                isNew
                onSubmit={submit}
              />
              {state.message ? (
                <Text
                  accessibilityRole={state.unknown ? "alert" : "text"}
                  style={state.confirmed ? styles.body : styles.error}
                >
                  {state.message}
                </Text>
              ) : null}
              <Action
                label={state.busy ? "正在处理…" : "更新密码"}
                disabled={disabled}
                onPress={submit}
              />
            </View>
          ) : (
            <Text style={styles.body}>当前账号没有修改密码的权限。</Text>
          )}
          <View style={styles.section}>
            <SiteInfoLinks />
            {state.unknown || state.confirmed ? (
              <>
                <Text style={styles.body}>
                  请退出后重新登录核对，不会自动尝试密码或重复提交改密。
                </Text>
                <Action
                  label="退出并前往登录"
                  disabled={state.busy}
                  onPress={() => void run.exit()}
                />
              </>
            ) : confirmExit ? (
              <>
                <Text style={styles.body}>确认退出当前账号？</Text>
                <Action
                  label="确认退出"
                  disabled={state.busy}
                  onPress={() => void run.exit()}
                />
                <Action
                  label="取消"
                  disabled={state.busy}
                  onPress={() => setConfirmExit(false)}
                />
              </>
            ) : (
              <Action
                label="退出登录"
                disabled={state.busy}
                onPress={() => setConfirmExit(true)}
              />
            )}
          </View>
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
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}
function PasswordInput({
  label,
  value,
  onChangeText,
  editable,
  isNew = false,
  error,
  onSubmit,
}: {
  label: string;
  value: string;
  onChangeText(this: void, value: string): void;
  editable: boolean;
  isNew?: boolean;
  error?: string;
  onSubmit?(this: void): void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.body}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={isNew ? "new-password" : "current-password"}
        textContentType={isNew ? "newPassword" : "password"}
        style={styles.input}
        onSubmitEditing={onSubmit}
        returnKeyType={onSubmit ? "done" : "next"}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    padding: 22,
    paddingTop: 30,
    paddingBottom: 48,
    gap: 12,
  },
  title: { color: colors.text, fontSize: 26, fontWeight: "700" },
  heading: { color: colors.text, fontSize: 22, fontWeight: "700" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  error: { color: colors.error, fontSize: 13, lineHeight: 20 },
  section: {
    marginTop: 16,
    gap: 14,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 20,
  },
  field: { gap: 6 },
  input: {
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
  },
  button: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  buttonText: { color: colors.primaryText, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.55 },
}));
