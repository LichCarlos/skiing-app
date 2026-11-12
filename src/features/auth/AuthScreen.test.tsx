import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Action = { onPress?: () => void; disabled?: boolean };
const screen = vi.hoisted(() => ({
  emptyStrings: 0,
  epoch: 3,
  status: "anonymous",
  restoreError: null as string | null,
  actions: new Map<string, Action>(),
  cleanups: [] as Array<() => void>,
  submit: undefined as (() => void) | undefined,
  replace: vi.fn(),
  signIn: vi.fn(async () => {}),
  register: vi.fn(),
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const seed =
        initial === ""
          ? ["snow", "password", "Snow"][screen.emptyStrings++ % 3]
          : initial;
      return actual.useState(seed);
    },
  };
});
vi.mock("../../platform/auth/session-provider", () => ({
  useAuthSession: () => ({
    user: null,
    status: screen.status,
    restoreError: screen.restoreError,
    signIn: screen.signIn,
    clearRestoreError: vi.fn(),
  }),
}));
vi.mock("../../platform/auth/auth-session", () => ({
  registerAccount: screen.register,
}));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => screen.epoch,
}));
vi.mock("../../../components/useColorScheme", () => ({
  useColorScheme: () => "light",
}));
vi.mock("expo-router", () => ({
  router: { replace: screen.replace, canGoBack: () => false, back: vi.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const cleanup = callback();
    if (cleanup) screen.cleanups.push(cleanup);
  },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) =>
    createElement("main", null, children),
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  KeyboardAvoidingView: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
  TextInput: (props: {
    accessibilityLabel: string;
    onSubmitEditing?: () => void;
  }) => {
    if (props.accessibilityLabel === "密码")
      screen.submit = props.onSubmitEditing;
    return createElement("input");
  },
  Pressable: (
    props: Action & { children?: ReactNode; accessibilityLabel?: string },
  ) => {
    screen.actions.set(
      props.accessibilityLabel ?? label(props.children),
      props,
    );
    return createElement(
      "button",
      { disabled: props.disabled },
      props.children,
    );
  },
  ActivityIndicator: () => createElement("span", null, "loading"),
  Platform: { OS: "ios" },
  StyleSheet: { create: (value: unknown) => value },
}));
import AuthScreen from "./AuthScreen";

function label(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(label).join("");
  return typeof node === "object" && "props" in node
    ? label((node.props as { children?: ReactNode }).children)
    : "";
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  screen.emptyStrings = 0;
  screen.epoch = 3;
  screen.status = "anonymous";
  screen.restoreError = null;
  screen.actions.clear();
  screen.cleanups = [];
  screen.submit = undefined;
  screen.signIn.mockResolvedValue(undefined);
});

describe("auth screen navigation and focus boundaries (native components mocked)", () => {
  it("does not accept guest navigation while explicit login is pending", async () => {
    const remote = deferred();
    screen.signIn.mockReturnValue(remote.promise);
    renderToStaticMarkup(createElement(AuthScreen));
    screen.submit?.();
    expect(screen.signIn).toHaveBeenCalledOnce();
    screen.actions.get("继续以游客身份浏览")?.onPress?.();
    expect(screen.replace).not.toHaveBeenCalled();
    remote.resolve();
    await vi.waitFor(() => expect(screen.replace).toHaveBeenCalledOnce());
    expect(screen.replace).toHaveBeenCalledWith("/(tabs)/profile");
  });
  it("does not redirect after leaving the authentication screen", async () => {
    const remote = deferred();
    screen.signIn.mockReturnValue(remote.promise);
    renderToStaticMarkup(createElement(AuthScreen));
    screen.submit?.();
    expect(screen.signIn).toHaveBeenCalledOnce();
    for (const cleanup of screen.cleanups) cleanup();
    remote.resolve();
    await remote.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.replace).not.toHaveBeenCalled();
  });
  it("does not redirect from a result belonging to a superseded session", async () => {
    const remote = deferred();
    screen.signIn.mockReturnValue(remote.promise);
    renderToStaticMarkup(createElement(AuthScreen));
    screen.submit?.();
    expect(screen.signIn).toHaveBeenCalledOnce();
    screen.epoch++;
    remote.resolve();
    await remote.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.replace).not.toHaveBeenCalled();
  });
  it("shows the session restoration boundary warning", () => {
    screen.restoreError = "浏览器会话结果尚未确认，请重新登录。";
    const html = renderToStaticMarkup(createElement(AuthScreen));
    expect(html).toContain(screen.restoreError);
  });
  it("blocks keyboard submission while the provider is restoring a session", () => {
    screen.status = "restoring";
    const html = renderToStaticMarkup(createElement(AuthScreen));
    expect(html).toContain("正在确认登录状态");
    screen.submit?.();
    expect(screen.signIn).not.toHaveBeenCalled();
    expect(screen.register).not.toHaveBeenCalled();
  });
  it("keeps guest browsing available while stored credentials are being restored", () => {
    screen.status = "restoring";
    renderToStaticMarkup(createElement(AuthScreen));
    screen.actions.get("继续以游客身份浏览")?.onPress?.();
    expect(screen.replace).toHaveBeenCalledExactlyOnceWith("/");
    expect(screen.signIn).not.toHaveBeenCalled();
  });
  it("gates repeated keyboard submission and back navigation before the UI rerenders", async () => {
    const remote = deferred();
    screen.signIn.mockReturnValue(remote.promise);
    renderToStaticMarkup(createElement(AuthScreen));
    screen.submit?.();
    screen.submit?.();
    screen.actions.get("返回")?.onPress?.();
    expect(screen.signIn).toHaveBeenCalledOnce();
    expect(screen.replace).not.toHaveBeenCalled();
    remote.resolve();
    await vi.waitFor(() => expect(screen.replace).toHaveBeenCalledOnce());
  });
});
