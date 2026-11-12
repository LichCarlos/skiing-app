import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  focused: true,
  stringStates: 0,
  status: "authenticated",
  route: undefined as unknown,
  user: null as null | {
    userId: number;
    account: string;
    permissionKeys: string[];
  },
  detail: {} as Record<string, unknown>,
  run: {} as Record<string, unknown>,
  options: [] as Array<Record<string, unknown>>,
  effects: [] as Array<() => void | (() => void)>,
  cancel: vi.fn(async () => {}),
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const [value, setter] = actual.useState(initial);
      if (
        value &&
        typeof value === "object" &&
        "revision" in value &&
        "active" in value
      )
        return [{ active: state.focused, revision: 4 }, setter];
      if (value && typeof value === "object" && "outcome" in value)
        return [{ ...value, ...state.run }, setter];
      if (
        typeof value === "string" &&
        value === "" &&
        ++state.stringStates === 1
      )
        return ["local-private-draft", setter];
      return [value, setter];
    },
  };
});
vi.mock("../../platform/auth/session-provider", () => ({
  useAuthSession: () => ({ user: state.user, status: state.status }),
}));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => 3,
  assertSessionEpoch: vi.fn(),
}));
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
vi.mock("../../../components/Themed", () => ({
  useThemeColor: (_props: unknown, name: string) =>
    name === "background" ? "#fff" : "#000",
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ dynamicId: state.route }),
  useRouter: () => ({ replace: vi.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    state.effects.push(callback);
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    state.options.push(options);
    return String((options.queryKey as string[])[0]) === "composer-fields"
      ? {
          ...state.detail,
          data: { entityType: "dynamic", groups: [], options: {} },
        }
      : state.detail;
  },
  useInfiniteQuery: (options: Record<string, unknown>) => {
    state.options.push(options);
    return { isPending: true };
  },
  useQueryClient: () => ({
    cancelQueries: state.cancel,
    invalidateQueries: vi.fn(),
  }),
}));
vi.mock("react-native", () => ({
  useColorScheme: () => "light",
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("main", null, children),
  Pressable: ({
    children,
    disabled,
  }: {
    children?: ReactNode;
    disabled?: boolean;
  }) => createElement("button", { disabled }, children),
  TextInput: ({
    accessibilityLabel,
    editable,
    value,
  }: {
    accessibilityLabel?: string;
    editable?: boolean;
    value?: string;
  }) =>
    createElement("textarea", {
      "aria-label": accessibilityLabel,
      disabled: editable === false,
      defaultValue: value,
    }),
  Image: () => null,
  ActivityIndicator: () => null,
  StyleSheet: { create: (value: unknown) => value },
}));
import ComposerScreen from "./composer-screen";
beforeEach(() => {
  state.focused = true;
  state.status = "authenticated";
  state.route = undefined;
  state.user = {
    userId: 7,
    account: "snow",
    permissionKeys: [
      "community:dynamic:create",
      "community:dynamic:update-own",
      "community:dynamic:read-own",
      "asset:upload",
    ],
  };
  state.detail = {
    data: null,
    isPending: false,
    isFetching: false,
    isError: false,
  };
  state.run = { ready: true, busy: false, outcome: "idle", conflict: false };
  state.options = [];
  state.effects = [];
  state.cancel.mockClear();
});
const render = () => {
  state.stringStates = 0;
  return renderToStaticMarkup(createElement(ComposerScreen));
};
describe("composer UI gates with Native/Router/Query replacements", () => {
  it.each(["0", "2147483648", ["11"]])(
    "rejects invalid edit route %j without reads",
    (route) => {
      state.route = route;
      expect(render()).toContain("动态编号无效");
      expect(state.options).toHaveLength(0);
    },
  );
  it("waits for session restoration without reads", () => {
    state.status = "restoring";
    expect(render()).toContain("正在恢复会话");
    expect(state.options).toHaveLength(0);
  });
  it("requires login and grants before mounting the draft", () => {
    state.user = null;
    expect(render()).toContain("登录后可以发布动态");
    expect(state.options).toHaveLength(0);
  });
  it("requires read-own as well as update-own to edit", () => {
    state.route = "11";
    state.user!.permissionKeys = ["community:dynamic:update-own"];
    expect(render()).toContain("当前账号没有发布或编辑权限");
    expect(state.options).toHaveLength(0);
  });
  it.each(["blur", "refresh", "error"])(
    "hides a retained private draft on %s",
    (mode) => {
      if (mode === "blur") state.focused = false;
      if (mode === "refresh") state.detail.isFetching = true;
      if (mode === "error") state.detail.isError = true;
      expect(render()).not.toContain("local-private-draft");
      if (mode === "blur") expect(state.options[0]!.enabled).toBe(false);
    },
  );
  it.each(["uncertain", "confirmed"])(
    "locks the draft after %s submission and offers own-list review",
    (outcome) => {
      state.run.outcome = outcome;
      const html = render();
      expect(html).toContain("前往我的动态核对");
      expect(html).toContain('aria-label="动态正文" disabled=""');
    },
  );
  it("keeps the local draft visible but disabled until a conflict is explicitly reloaded", () => {
    state.run.conflict = true;
    const html = render();
    expect(html).toContain("local-private-draft");
    expect(html).toContain("重新载入最新内容");
    expect(html).toContain('aria-label="动态正文" disabled=""');
  });
  it("keys detail and resort lookup by captured epoch/focus and cancels both prefixes", () => {
    render();
    expect(state.options.map((option) => option.queryKey)).toEqual([
      ["composer-detail", 7, 3, null, 4],
      ["composer-fields", 7, 3, 4],
      ["composer-resorts", 7, 3, 4, ""],
    ]);
    expect(state.options[0]).toMatchObject({
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
    for (const effect of state.effects) effect()?.();
    expect(state.cancel.mock.calls).toEqual([
      [{ queryKey: ["composer-detail", 7, 3, null] }],
      [{ queryKey: ["composer-fields", 7, 3] }],
      [{ queryKey: ["composer-resorts", 7, 3] }],
    ]);
  });
});
