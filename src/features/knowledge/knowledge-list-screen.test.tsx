import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  focused: true,
  status: "authenticated",
  search: "",
  user: null as null | {
    userId: number;
    account: string;
    permissionKeys: string[];
  },
  detail: {} as Record<string, unknown>,
  infinite: {} as Record<string, unknown>,
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
      return value &&
        typeof value === "object" &&
        "revision" in value &&
        "active" in value
        ? [{ active: state.focused, revision: 4 }, setter]
        : typeof value === "string" && value === ""
          ? [state.search, setter]
          : [value, setter];
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
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  router: { push: vi.fn() },
  useFocusEffect: (callback: () => void | (() => void)) => {
    state.effects.push(callback);
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    state.options.push(options);
    return state.detail;
  },
  useInfiniteQuery: (options: Record<string, unknown>) => {
    state.options.push(options);
    return state.infinite;
  },
  useQueryClient: () => ({
    cancelQueries: state.cancel,
    invalidateQueries: vi.fn(),
    setQueriesData: vi.fn(),
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
  }: {
    accessibilityLabel?: string;
    editable?: boolean;
  }) =>
    createElement("textarea", {
      "aria-label": accessibilityLabel,
      disabled: editable === false,
    }),
  Image: () => null,
  ActivityIndicator: () => createElement("i", null, "loading"),
  RefreshControl: () => null,
  FlatList: ({
    data,
    renderItem,
    ListEmptyComponent,
  }: {
    data: unknown[];
    renderItem: (input: { item: unknown }) => ReactNode;
    ListEmptyComponent: ReactNode;
  }) =>
    createElement(
      "section",
      null,
      data.length
        ? data.map((item, i) =>
            createElement("div", { key: i }, renderItem({ item })),
          )
        : ListEmptyComponent,
    ),
  StyleSheet: { create: (value: unknown) => value },
}));
import KnowledgeListScreen from "./knowledge-list-screen";
import { ApiError } from "../../platform/api/api-error";
const item = {
  articleId: 11,
  title: "public-knowledge-title",
  summary: "summary",
  coverUrl: null,
  category: { value: "safety", label: "Safety" },
  authorName: null,
  publishTime: "2026-11-02T00:00:00Z",
  favoriteByMe: true,
};
beforeEach(() => {
  state.focused = true;
  state.status = "authenticated";
  state.search = "";
  state.user = { userId: 7, account: "snow", permissionKeys: [] };
  state.detail = { data: [item.category], isError: false, isPending: false };
  state.infinite = {
    data: { pages: [{ items: [item], total: 1 }] },
    isPending: false,
    isError: false,
    isFetching: false,
    hasNextPage: false,
  };
  state.options = [];
  state.effects = [];
  state.cancel.mockClear();
});
const render = () => renderToStaticMarkup(createElement(KnowledgeListScreen));
describe("knowledge list wiring with Native/Router/Query replacements", () => {
  it("does not read while restoring", () => {
    state.status = "restoring";
    expect(render()).toContain("正在恢复会话");
    expect(state.options).toHaveLength(0);
  });
  it("disables reads and hides cached cards on blur", () => {
    state.focused = false;
    expect(render()).not.toContain(item.title);
    expect(state.options.every((o) => o.enabled === false)).toBe(true);
  });
  it.each([401, 403])(
    "hides previous personal projections after %s",
    (status) => {
      state.infinite.isError = true;
      state.infinite.error = new ApiError("denied", {
        status,
        code: null,
        traceId: null,
      });
      expect(render()).not.toContain(item.title);
    },
  );
  it("hides invalid responses even when cached data exists", () => {
    state.infinite.isError = true;
    state.infinite.error = new TypeError("invalid");
    expect(render()).not.toContain(item.title);
  });
  it("retains valid cards during a transient network refresh error", () => {
    state.infinite.isError = true;
    state.infinite.isRefetchError = true;
    state.infinite.error = new ApiError("offline", {
      status: 0,
      code: null,
      traceId: null,
    });
    expect(render()).toContain(item.title);
  });
  it("renders guest articles without requiring favorite permission", () => {
    state.user = null;
    expect(render()).toContain(item.title);
    expect(state.options[1]!.queryKey).toEqual([
      "public-articles",
      null,
      3,
      "page=1&pageSize=12",
      4,
    ]);
  });
  it("suppresses stale categories independently while retaining articles", () => {
    state.detail.isError = true;
    const html = render();
    expect(html).toContain(item.title);
    expect(html).not.toContain(">Safety</span></button>");
  });
  it("does not query oversized filters or crash the page", () => {
    state.search = "x".repeat(101);
    expect(render()).not.toContain(item.title);
    expect(state.options[1]!.enabled).toBe(false);
  });
  it("partitions epoch/focus and cancels lists and categories", () => {
    render();
    expect(state.options.map((o) => o.queryKey)).toEqual([
      ["public-article-categories", 7, 3, 4],
      ["public-articles", 7, 3, "page=1&pageSize=12", 4],
    ]);
    expect(
      state.options.every(
        (o) =>
          o.retry === false &&
          o.refetchOnWindowFocus === false &&
          o.refetchOnReconnect === false,
      ),
    ).toBe(true);
    for (const effect of state.effects) effect()?.();
    expect(state.cancel.mock.calls).toEqual([
      [{ queryKey: ["public-articles", 7, 3] }],
      [{ queryKey: ["public-article-categories", 7, 3] }],
    ]);
  });
});
