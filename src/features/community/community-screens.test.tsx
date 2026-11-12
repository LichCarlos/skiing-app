import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  focused: true,
  status: "authenticated",
  route: "11" as unknown,
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
  useLocalSearchParams: () => ({ dynamicId: state.route }),
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
import DynamicDetailScreen from "./dynamic-detail-screen";
import FeedScreen from "./feed-screen";
import { ApiError } from "../../platform/api/api-error";
const date = "2026-11-02T00:00:00Z";
const item = {
  dynamicId: 11,
  author: { userId: 7, nickname: "snow", avatarUrl: null },
  content: "public-detail-text",
  summary: "public-feed-text",
  coverUrl: null,
  resort: null,
  imageUrls: [],
  createdAt: date,
  likedByMe: false,
  likeCount: 0,
  commentCount: 1,
};
const comment = {
  commentId: 21,
  author: item.author,
  content: "old-comment-text",
  createdAt: date,
};
beforeEach(() => {
  state.focused = true;
  state.status = "authenticated";
  state.route = "11";
  state.user = {
    userId: 7,
    account: "snow",
    permissionKeys: [
      "community:like:toggle",
      "community:comment:create",
      "community:dynamic:update-own",
      "community:dynamic:create",
    ],
  };
  state.detail = {
    data: item,
    isFetching: false,
    isPending: false,
    isError: false,
  };
  state.infinite = {
    data: { pages: [{ items: [comment], total: 1 }] },
    isError: false,
    isPending: false,
    isRefetching: false,
    hasNextPage: false,
  };
  state.options = [];
  state.effects = [];
  state.cancel.mockClear();
});
const detail = () => renderToStaticMarkup(createElement(DynamicDetailScreen));
describe("community screen wiring with Native/Router/Query replacements", () => {
  it.each(["2147483648", ["11"], "0"])(
    "rejects malformed route %j without queries",
    (route) => {
      state.route = route;
      expect(detail()).toContain("动态编号无效");
      expect(state.options).toHaveLength(0);
    },
  );
  it("does not read while restoring a session", () => {
    state.status = "restoring";
    expect(detail()).toContain("正在恢复会话");
    expect(state.options).toHaveLength(0);
  });
  it("disables all reads and hides retained detail while blurred", () => {
    state.focused = false;
    expect(detail()).not.toContain(item.content);
    expect(state.options.every((option) => option.enabled === false)).toBe(
      true,
    );
  });
  it("hides cached detail while refreshing and after a 404", () => {
    state.detail.isFetching = true;
    expect(detail()).not.toContain(item.content);
    state.detail.isFetching = false;
    state.detail.isError = true;
    state.detail.error = new ApiError("missing", {
      status: 404,
      code: null,
      traceId: null,
    });
    const html = detail();
    expect(html).toContain("当前不可见");
    expect(html).not.toContain(item.content);
  });
  it("renders authorized owner actions and comments from separate page data", () => {
    const html = detail();
    expect(html).toContain(item.content);
    expect(html).toContain(comment.content);
    expect(html).toContain("编辑");
    expect(html).toContain('aria-label="评论内容"');
  });
  it("hides write controls without grants", () => {
    state.user!.permissionKeys = [];
    const html = detail();
    expect(html).not.toContain("编辑");
    expect(html).not.toContain('aria-label="评论内容"');
    expect(html).toContain("未获评论权限");
  });
  it("hides old comments after failed refresh", () => {
    state.infinite.isError = true;
    const html = detail();
    expect(html).toContain(item.content);
    expect(html).not.toContain(comment.content);
    expect(html).toContain("评论加载失败");
  });
  it("keys queries by account, captured epoch and focus revision and cancels both on blur", () => {
    detail();
    expect(state.options.map((o) => o.queryKey)).toEqual([
      ["community-dynamic", 11, 7, 3, 4],
      ["community-comments", 11, 7, 3, 4],
    ]);
    for (const effect of state.effects) {
      const cleanup = effect();
      if (cleanup) cleanup();
    }
    expect(state.cancel.mock.calls).toEqual([
      [{ queryKey: ["community-dynamic", 11, 7, 3] }],
      [{ queryKey: ["community-comments", 11, 7, 3] }],
    ]);
  });
  it("feed uses the current epoch and suppresses the old feed on 403", () => {
    state.infinite.data = { pages: [{ items: [item] }] };
    expect(renderToStaticMarkup(createElement(FeedScreen))).toContain(
      item.summary,
    );
    expect(state.options[0]).toMatchObject({
      enabled: true,
      retry: false,
      queryKey: ["community-dynamics", 7, 3, { keyword: "" }, 4],
    });
    state.infinite.isError = true;
    state.infinite.error = new ApiError("denied", {
      status: 403,
      code: null,
      traceId: null,
    });
    expect(renderToStaticMarkup(createElement(FeedScreen))).not.toContain(
      item.summary,
    );
  });
});
