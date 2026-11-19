import { ActivityIndicator, Pressable } from "../../components/controls";
import { Text } from "../../../components/Themed";
import { brutalFrame, createThemedStyles, radius } from "../../theme";
import { Link } from "expo-router";
import { View } from "react-native";
import { useAuthSession } from "../../platform/auth/session-provider";
import { Fragment, type PropsWithChildren } from "react";

export function AiAccess({
  children,
  epoch = 0,
}: PropsWithChildren<{ epoch?: number }>) {
  const aiStyles = useAiStyles();
  const session = useAuthSession();
  const { user, status } = session;
  if (status === "restoring")
    return <ActivityIndicator accessibilityLabel="正在恢复登录" />;
  if (status !== "authenticated" || !user)
    return (
      <View style={aiStyles.state}>
        <Text>登录后可使用滑雪 AI 助手。</Text>
        <Link href="/auth">登录 / 注册</Link>
      </View>
    );
  if (!user.permissionKeys.includes("ai:conversation:use"))
    return (
      <View style={aiStyles.state}>
        <Text>当前账号尚未获准使用 AI，请联系管理员。</Text>
        <Pressable onPress={() => void session.retryRestore()}>
          <Text style={aiStyles.link}>重新读取身份</Text>
        </Pressable>
      </View>
    );
  return (
    <Fragment
      key={JSON.stringify([
        user.userId,
        user.account,
        [...user.permissionKeys].sort(),
        epoch,
      ])}
    >
      {children}
    </Fragment>
  );
}

export const useAiStyles = createThemedStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 32,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  body: { color: colors.text, fontSize: 16, lineHeight: 25 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  error: { color: colors.error, fontSize: 14, lineHeight: 21 },
  state: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  card: {
    ...brutalFrame(colors),
    padding: 20,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: 12,
  },
  userCard: { backgroundColor: colors.soft, marginLeft: 24 },
  button: {
    ...brutalFrame(colors, true),
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  buttonText: { color: colors.primaryText, fontWeight: "600", fontSize: 15 },
  link: { color: colors.primary, fontSize: 15, paddingVertical: 10 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderWidth: 2,
    padding: 14,
    borderRadius: radius.md,
    color: colors.text,
    minHeight: 84,
    fontSize: 16,
    textAlignVertical: "top",
  },
}));
