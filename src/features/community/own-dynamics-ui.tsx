import { ActivityIndicator } from "../../components/controls";
import { Text } from "../../../components/Themed";
import { createThemedStyles, radius } from "../../theme";
import type { PropsWithChildren } from "react";
import { Link } from "expo-router";
import { View } from "react-native";
import { useAuthSession } from "../../platform/auth/session-provider";
import { ApiError } from "../../platform/api/api-error";
import type { OwnDynamicStatus } from "./community-api";

export const dynamicStatusLabels: Record<OwnDynamicStatus, string> = {
  pending: "审核中",
  published: "已发布",
  hidden: "已隐藏",
};

export function OwnDynamicsAccess({ children }: PropsWithChildren) {
  const ownStyles = useOwnStyles();
  const { user, status } = useAuthSession();
  if (status === "restoring")
    return <ActivityIndicator accessibilityLabel="正在恢复登录" />;
  if (!user)
    return (
      <View style={ownStyles.state}>
        <Text>登录后查看本人动态</Text>
        <Link href="/auth">登录 / 注册</Link>
      </View>
    );
  if (!user.permissionKeys.includes("community:dynamic:read-own"))
    return (
      <View style={ownStyles.state}>
        <Text>当前账号没有查看本人动态的权限。</Text>
      </View>
    );
  return children;
}

export function ownDynamicError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "登录状态已失效，请重新登录。";
    if (error.status === 403) return "当前账号没有执行此操作的权限。";
    if (error.status === 404) return "动态已删除或不属于当前账号。";
  }
  return "操作失败，请检查网络后重试。";
}

export const useOwnStyles = createThemedStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
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
    gap: 16,
    flexWrap: "wrap",
  },
  card: {
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: 10,
  },
  link: { color: colors.primary, fontSize: 15, paddingVertical: 12 },
  selected: { fontWeight: "700", textDecorationLine: "underline" },
  image: {
    width: "100%",
    height: 220,
    backgroundColor: colors.soft,
    borderRadius: radius.md,
  },
}));
