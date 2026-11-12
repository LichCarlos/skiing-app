import { Text } from "../../components/Themed";
import { createThemedStyles, radius } from "../../src/theme";
import { Pressable } from "../../src/components/controls";
import { palette as colors } from "../../src/theme";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";

import { useColorScheme } from "../../components/useColorScheme";
import { useAuthSession } from "../../src/platform/auth/session-provider";
import { sessionEpoch } from "../../src/platform/auth/secure-session";
import { useSiteConfig } from "../../src/features/site-config/use-site-config";
import { SiteInfoLinks } from "../../src/features/site-config/policy-screen";
import {
  ProfileHomeRun,
  homeSessionKey,
  homeTargetAllowed,
  PROFILE_HOME_LINKS,
} from "../../src/features/profile/profile-home-run";

export default function ProfileScreen(): React.JSX.Element {
  const { user, status } = useAuthSession();
  return (
    <ProfileWorkspace
      key={homeSessionKey({ user, status, epoch: sessionEpoch() })}
    />
  );
}

function ProfileWorkspace(): React.JSX.Element {
  const styles = useStyles();
  const site = useSiteConfig();
  const colorScheme = useColorScheme();
  const theme = colors[colorScheme === "dark" ? "dark" : "light"];
  const session = useAuthSession();
  const { user, status, restoreError } = session;
  const latest = useRef(session);
  latest.current = session;
  const frame = { user, status, epoch: sessionEpoch() };
  const [run] = useState(
    () =>
      new ProfileHomeRun(frame, {
        session: () => ({
          user: latest.current.user,
          status: latest.current.status,
          epoch: sessionEpoch(),
        }),
        refresh: (signal) => latest.current.refreshProfile(signal),
        signOut: () =>
          user
            ? latest.current.signOut({
                userId: user.userId,
                account: user.account,
              })
            : Promise.resolve(),
        restore: () => latest.current.retryRestore(),
        navigate: (path) => router.push(path as Href),
        changed: (value) => setHome(value),
      }),
  );
  const [home, setHome] = useState(() => run.snapshot());
  const signingOut = home.loggingOut;
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      run.activate();
      void run.refresh();
      return () => run.deactivate();
    }, [run]),
  );
  const disabled = !home.active || signingOut || home.recovering;

  const isRestoring = status === "restoring";

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {isRestoring ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.primary} />
          <Text style={[styles.stateText, { color: theme.muted }]}>
            正在恢复登录状态
          </Text>
        </View>
      ) : user ? (
        <>
          {home.profileDenied ? (
            <Text
              accessibilityRole="alert"
              style={[styles.stateText, { color: theme.error }]}
            >
              账号资料暂不可读，可以重试更新或前往账号设置。
            </Text>
          ) : (
            <>
              <View style={styles.identity}>
                <View
                  style={[styles.avatar, { backgroundColor: theme.primary }]}
                >
                  {user.avatarUrl && failedAvatar !== user.avatarUrl ? (
                    <Image
                      source={{ uri: user.avatarUrl }}
                      style={styles.avatar}
                      onError={() => setFailedAvatar(user.avatarUrl)}
                    />
                  ) : (
                    <Text
                      style={[styles.avatarText, { color: theme.primaryText }]}
                    >
                      {firstCodePoint(user.nickname || user.account)}
                    </Text>
                  )}
                </View>
                <View style={styles.identityCopy}>
                  <Text style={[styles.name, { color: theme.text }]}>
                    {user.nickname}
                  </Text>
                  <Text style={[styles.account, { color: theme.muted }]}>
                    {user.account}
                  </Text>
                </View>
              </View>

              <View style={[styles.details, { borderColor: theme.border }]}>
                <InfoRow label="账号" value={user.account} theme={theme} />
                <InfoRow
                  label="身份"
                  value={
                    user.roles.map(({ roleName }) => roleName).join("、") ||
                    "注册用户"
                  }
                  theme={theme}
                />
                {user.merchant && (
                  <InfoRow
                    label="商家资料"
                    value={user.merchant.businessName ?? "商家"}
                    theme={theme}
                    isLast
                  />
                )}
              </View>
            </>
          )}
          {home.refreshing && (
            <ActivityIndicator
              accessibilityLabel="正在更新账号资料"
              color={theme.primary}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: disabled || home.refreshing }}
            disabled={disabled || home.refreshing}
            onPress={() => void run.refresh()}
            style={[styles.secondaryButton, { borderColor: theme.border }]}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
              更新账号资料
            </Text>
          </Pressable>
          {(
            Object.keys(PROFILE_HOME_LINKS) as Array<
              keyof typeof PROFILE_HOME_LINKS
            >
          )
            .filter((target) => homeTargetAllowed(target, frame))
            .map((target) => (
              <Pressable
                key={target}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => run.navigate(target)}
                style={[styles.secondaryButton, { borderColor: theme.border }]}
              >
                <Text
                  style={[styles.secondaryButtonText, { color: theme.text }]}
                >
                  {PROFILE_HOME_LINKS[target].label}
                </Text>
              </Pressable>
            ))}
          {(home.notice || restoreError) && (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: theme.error }]}
            >
              {home.notice ?? restoreError}
            </Text>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => void run.signOut()}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            {signingOut ? (
              <ActivityIndicator color={theme.muted} />
            ) : (
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                退出登录
              </Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <View
            style={[styles.guestMark, { backgroundColor: theme.highlight }]}
          >
            <Text
              style={[styles.guestMarkText, { color: theme.highlightText }]}
            >
              客
            </Text>
          </View>
          <Text style={[styles.guestTitle, { color: theme.text }]}>
            游客模式
          </Text>
          <Text style={[styles.guestDescription, { color: theme.muted }]}>
            开始你的雪上旅程
          </Text>

          {restoreError && (
            <View style={styles.restoreNotice}>
              <Text style={[styles.error, { color: theme.error }]}>
                {restoreError}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => void run.retryRestore()}
                style={styles.retryButton}
              >
                <Text style={[styles.linkText, { color: theme.primary }]}>
                  重试会话恢复
                </Text>
              </Pressable>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => run.navigate("auth")}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.warm, opacity: pressed ? 0.94 : 1 },
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: theme.warmText }]}>
              登录 / 注册
            </Text>
          </Pressable>
          {home.notice && (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: theme.error }]}
            >
              {home.notice}
            </Text>
          )}
        </>
      )}
      {site.isError && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void site.refetch()}
        >
          <Text style={{ color: theme.error }}>平台信息加载失败，点击重试</Text>
        </Pressable>
      )}
      <SiteInfoLinks />
    </ScrollView>
  );
}

interface ProfileTheme {
  text: string;
  muted: string;
  border: string;
}

function InfoRow({
  label,
  value,
  theme,
  isLast = false,
}: {
  label: string;
  value: string;
  theme: ProfileTheme;
  isLast?: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      style={[
        styles.infoRow,
        !isLast && {
          borderBottomColor: theme.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Text style={[styles.infoLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function firstCodePoint(value: string): string {
  return Array.from(value)[0] ?? "雪";
}

const useStyles = createThemedStyles(() => ({
  page: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  kicker: { fontSize: 13, fontWeight: "700" },
  title: { fontSize: 28, fontWeight: "700", marginTop: 5, marginBottom: 24 },
  centerState: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  stateText: { marginTop: 12, fontSize: 14 },
  identity: { flexDirection: "row", alignItems: "center", marginBottom: 22 },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 25, fontWeight: "700" },
  identityCopy: { marginLeft: 14, flex: 1 },
  name: { fontSize: 22, fontWeight: "700" },
  account: { fontSize: 14, marginTop: 4 },
  details: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
  },
  infoLabel: { fontSize: 14 },
  infoValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
  },
  error: { fontSize: 13, lineHeight: 19, marginTop: 14 },
  secondaryButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: "600" },
  guestMark: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  guestMarkText: { fontSize: 32, fontWeight: "700" },
  guestTitle: { fontSize: 21, fontWeight: "700", marginTop: 18 },
  guestDescription: { fontSize: 14, marginTop: 6 },
  restoreNotice: { marginTop: 14 },
  retryButton: { alignSelf: "flex-start", paddingVertical: 10 },
  linkText: { fontSize: 14, fontWeight: "600" },
  primaryButton: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  primaryButtonText: { fontSize: 16, fontWeight: "700" },
}));
