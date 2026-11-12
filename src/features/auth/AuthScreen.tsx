import { Text } from "../../../components/Themed";
import { createThemedStyles, radius } from "../../theme";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
} from "../../components/controls";
import { palette } from "../../theme";
import { useCallback, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { registerAccount } from "../../platform/auth/auth-session";
import { useAuthSession } from "../../platform/auth/session-provider";
import { sessionEpoch } from "../../platform/auth/secure-session";
import { useColorScheme } from "../../../components/useColorScheme";
import { AuthFormRun, type AuthMode } from "./auth-form-run";

export default function AuthScreen(): React.JSX.Element {
  const styles = useStyles();
  const params = useLocalSearchParams<{ notice?: string }>();
  const colorScheme = useColorScheme();
  const colors = palette[colorScheme === "dark" ? "dark" : "light"];
  const session = useAuthSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [mode, setMode] = useState<AuthMode>("login");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [run] = useState(
    () =>
      new AuthFormRun(
        {
          signIn: (input) => sessionRef.current.signIn(input),
          register: (input, signal) => registerAccount(input, { signal }),
          epoch: sessionEpoch,
          restoring: () => sessionRef.current.status === "restoring",
          clearPassword: () => {
            setPassword("");
            setShowPassword(false);
          },
          signedIn: () => router.replace("/(tabs)/profile"),
          registered: (registeredAccount) => {
            setAccount(registeredAccount);
            setMode("login");
          },
          changed: (value) => setFormState(value),
        },
        params.notice,
      ),
  );
  const [formState, setFormState] = useState(() => run.snapshot());
  const {
    busy: submitting,
    errors,
    message,
    success: messageIsSuccess,
    traceId,
  } = formState;
  const disabled =
    !formState.active || submitting || session.status === "restoring";
  const navigationDisabled = !formState.active || submitting;
  useFocusEffect(
    useCallback(() => {
      run.activate();
      return () => {
        run.deactivate();
        setPassword("");
        setShowPassword(false);
      };
    }, [run]),
  );

  function changeMode(nextMode: AuthMode): void {
    if (!run.clearFeedback()) return;
    setMode(nextMode);
    setPassword("");
    setShowPassword(false);
    session.clearRestoreError();
  }

  async function submit(): Promise<void> {
    await run.submit(mode, { account, password, nickname });
  }

  function leaveForGuest(): void {
    if (!run.canNavigate()) return;
    router.replace("/");
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: navigationDisabled }}
              disabled={navigationDisabled}
              onPress={() => {
                if (!run.canNavigate()) return;
                if (router.canGoBack()) router.back();
                else leaveForGuest();
              }}
              style={styles.backButton}
              hitSlop={8}
            >
              <Text style={[styles.backText, { color: colors.muted }]}>
                返回
              </Text>
            </Pressable>

            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>凛</Text>
            </View>
            <Text style={[styles.brand, { color: colors.text }]}>凛迹雪客</Text>
            <Text style={[styles.heading, { color: colors.text }]}>
              {mode === "login" ? "欢迎回来" : "创建账号"}
            </Text>

            <View style={[styles.segment, { backgroundColor: colors.segment }]}>
              {(["login", "register"] as const).map((item) => {
                const selected = mode === item;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="tab"
                    accessibilityState={{ selected, disabled }}
                    disabled={disabled}
                    onPress={() => changeMode(item)}
                    style={[
                      styles.segmentButton,
                      selected && [
                        styles.segmentSelected,
                        { backgroundColor: colors.accent },
                      ],
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: selected ? colors.accentText : colors.muted },
                      ]}
                    >
                      {item === "login" ? "登录" : "注册"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {mode === "register" && (
              <FormField
                label="昵称"
                value={nickname}
                onChangeText={setNickname}
                error={errors.nickname}
                colors={colors}
                autoComplete="name"
                textContentType="name"
                editable={!disabled}
                returnKeyType="next"
              />
            )}
            <FormField
              label="账号"
              value={account}
              onChangeText={setAccount}
              error={errors.account}
              colors={colors}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              editable={!disabled}
              returnKeyType="next"
            />
            <FormField
              label="密码"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              colors={colors}
              secureTextEntry={!showPassword}
              editable={!disabled}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              textContentType={mode === "login" ? "password" : "newPassword"}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              accessory={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "隐藏密码" : "显示密码"}
                  disabled={disabled}
                  accessibilityState={{ disabled }}
                  onPress={() => {
                    if (run.canInteract())
                      setShowPassword((visible) => !visible);
                  }}
                  hitSlop={8}
                >
                  <Text
                    style={[styles.passwordToggle, { color: colors.primary }]}
                  >
                    {showPassword ? "隐藏" : "显示"}
                  </Text>
                </Pressable>
              }
            />

            {session.status === "restoring" && (
              <View accessibilityLiveRegion="polite">
                <ActivityIndicator accessibilityLabel="正在恢复登录会话" />
                <Text style={{ color: colors.muted }}>
                  正在确认登录状态，请稍候。
                </Text>
              </View>
            )}
            {session.restoreError && (
              <Text accessibilityRole="alert" style={{ color: colors.error }}>
                {session.restoreError}
              </Text>
            )}
            {message && (
              <View
                accessibilityRole="alert"
                style={[
                  styles.notice,
                  {
                    borderColor: messageIsSuccess
                      ? colors.success
                      : colors.error,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <Text
                  style={{
                    color: messageIsSuccess ? colors.success : colors.error,
                  }}
                >
                  {message}
                </Text>
                {traceId && (
                  <Text style={[styles.traceId, { color: colors.muted }]}>
                    请求编号：{traceId}
                  </Text>
                )}
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.submitButton,
                {
                  backgroundColor: colors.warm,
                  opacity: disabled ? 0.7 : pressed ? 0.88 : 1,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={[styles.submitText, { color: colors.warmText }]}>
                  {mode === "login" ? "登录" : "创建账号"}
                </Text>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: navigationDisabled }}
              disabled={navigationDisabled}
              onPress={leaveForGuest}
              style={styles.guestButton}
            >
              <Text style={[styles.guestText, { color: colors.muted }]}>
                继续以游客身份浏览
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface FormColors {
  surface: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  error: string;
}

type FormFieldProps = Omit<
  React.ComponentProps<typeof TextInput>,
  "value" | "onChangeText"
> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  colors: FormColors;
  accessory?: React.ReactNode;
};

function FormField({
  label,
  value,
  onChangeText,
  error,
  colors,
  accessory,
  ...inputProps
}: FormFieldProps): React.JSX.Element {
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View
        style={[
          styles.inputShell,
          {
            backgroundColor: colors.surface,
            borderColor: error
              ? colors.error
              : focused
                ? colors.primary
                : colors.border,
          },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          autoCorrect={false}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder={label}
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={[styles.input, { color: colors.text }]}
          value={value}
          {...inputProps}
        />
        {accessory}
      </View>
      {error && (
        <Text style={[styles.fieldError, { color: colors.error }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center" },
  content: { width: "100%", maxWidth: 480, alignSelf: "center", padding: 24 },
  backButton: { height: 36, justifyContent: "center", alignSelf: "flex-start" },
  backText: { fontSize: 15, fontWeight: "600" },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.highlight,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  brandMarkText: {
    color: colors.highlightText,
    fontSize: 23,
    fontWeight: "700",
  },
  brand: { fontSize: 16, fontWeight: "700", marginTop: 12 },
  heading: {
    fontSize: 30,
    lineHeight: 42,
    fontWeight: "700",
    marginTop: 5,
    marginBottom: 22,
  },
  segment: {
    minHeight: 48,
    borderRadius: radius.md,
    padding: 4,
    flexDirection: "row",
    marginBottom: 22,
  },
  segmentButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  segmentSelected: { borderRadius: radius.sm },
  segmentText: { fontSize: 15, fontWeight: "600" },
  field: { marginBottom: 15 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 7 },
  inputShell: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingVertical: 11,
    paddingHorizontal: 0,
    borderWidth: 0,
    borderRadius: 0,
    fontSize: 16,
  },
  passwordToggle: {
    paddingLeft: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "600",
  },
  fieldError: { fontSize: 13, marginTop: 5 },
  notice: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 2,
    marginBottom: 14,
  },
  traceId: { fontSize: 13, marginTop: 5 },
  submitButton: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  submitText: { fontSize: 16, fontWeight: "700" },
  guestButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  guestText: { fontSize: 14, fontWeight: "600" },
}));
