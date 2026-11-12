import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { components } from "../../platform/api/openapi";
type User = components["schemas"]["CurrentUserVO"];
type Action = { onPress?: () => void; disabled?: boolean };
const model = vi.hoisted(() => ({
  user: null as User | null,
  epoch: 3,
  status: "authenticated",
  actions: new Map<string, Action>(),
  effects: [] as Array<() => void>,
  push: vi.fn(),
  signOut: vi.fn(async () => {}),
  refresh: vi.fn(async (): Promise<User> => model.user!),
}));
vi.mock("../../platform/auth/session-provider", () => ({
  useAuthSession: () => ({
    user: model.user,
    status: model.status,
    restoreError: null,
    signOut: model.signOut,
    refreshProfile: model.refresh,
    retryRestore: vi.fn(async () => {}),
  }),
}));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => model.epoch,
}));
vi.mock("../../../components/useColorScheme", () => ({
  useColorScheme: () => "light",
}));
vi.mock("../site-config/use-site-config", () => ({
  useSiteConfig: () => ({ data: null, isError: false, refetch: vi.fn() }),
}));
vi.mock("../site-config/policy-screen", () => ({ SiteInfoLinks: () => null }));
vi.mock("expo-router", () => ({
  router: { push: model.push },
  useFocusEffect: (callback: () => void | (() => void)) => {
    const cleanup = callback();
    if (cleanup) model.effects.push(cleanup);
  },
}));
function label(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(label).join("");
  return node && typeof node === "object" && "props" in node
    ? label((node.props as { children?: ReactNode }).children)
    : "";
}
vi.mock("react-native", () => ({
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("main", null, children),
  Image: () => createElement("img", { alt: "avatar" }),
  Pressable: (props: Action & { children?: ReactNode }) => {
    model.actions.set(label(props.children), props);
    return createElement(
      "button",
      { disabled: props.disabled },
      props.children,
    );
  },
  ActivityIndicator: () => createElement("span", null, "loading"),
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
import ProfileScreen from "../../../app/(tabs)/profile";
beforeEach(() => {
  vi.clearAllMocks();
  model.actions.clear();
  model.effects = [];
  model.epoch = 3;
  model.status = "authenticated";
  model.user = {
    userId: 7,
    account: "snow",
    nickname: "Snow",
    avatarUrl: null,
    merchant: null,
    menuTree: [],
    roles: [],
    permissionKeys: [
      "account:profile:read",
      "account:profile:update",
      "member:favorite:toggle",
      "community:dynamic:read-own",
      "ai:conversation:use",
    ],
  };
  model.refresh.mockImplementation(async () => model.user!);
});
describe("personal home entry points (native components/focus mocked)", () => {
  it("does not show an AI entry without the current grant", () => {
    model.user!.permissionKeys = ["account:profile:read"];
    const html = renderToStaticMarkup(createElement(ProfileScreen));
    expect(html).not.toContain("滑雪 AI 助手");
  });
  it("does not log out a newer session through an older button callback", () => {
    renderToStaticMarkup(createElement(ProfileScreen));
    model.epoch++;
    model.actions.get("退出登录")?.onPress?.();
    expect(model.signOut).not.toHaveBeenCalled();
  });
  it("does not navigate from a callback belonging to a former account", () => {
    renderToStaticMarkup(createElement(ProfileScreen));
    model.epoch++;
    model.user = { ...model.user!, userId: 8, account: "other" };
    model.actions.get("我的收藏")?.onPress?.();
    expect(model.push).not.toHaveBeenCalled();
  });
  it("refreshes own profile and signed avatar when focused", () => {
    renderToStaticMarkup(createElement(ProfileScreen));
    expect(model.refresh).toHaveBeenCalledOnce();
  });
  it("does not impose a business role or profile-read grant on independent feature entries", () => {
    model.user!.permissionKeys = ["ai:conversation:use"];
    const html = renderToStaticMarkup(createElement(ProfileScreen));
    expect(html).toContain("滑雪 AI 助手");
    expect(html).not.toContain("我的收藏");
    expect(html).not.toContain("我的动态");
    expect(html).not.toContain("编辑资料");
    expect(html).toContain("账号设置");
  });
  it("rechecks a grant when a stale rendered button callback is used", () => {
    renderToStaticMarkup(createElement(ProfileScreen));
    model.user!.permissionKeys = [];
    model.actions.get("我的收藏")?.onPress?.();
    expect(model.push).not.toHaveBeenCalled();
  });
  it("keeps a guest login entry and does not read private profile data", () => {
    model.user = null;
    model.status = "anonymous";
    const html = renderToStaticMarkup(createElement(ProfileScreen));
    expect(html).toContain("游客模式");
    expect(model.refresh).not.toHaveBeenCalled();
    model.actions.get("登录 / 注册")?.onPress?.();
    expect(model.push).toHaveBeenCalledExactlyOnceWith("/auth");
  });
});
