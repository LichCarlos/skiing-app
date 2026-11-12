import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticleDetailView } from "./article-detail-view";
const state = vi.hoisted(() => ({
  epoch: 8,
  route: "11" as unknown,
  status: "authenticated",
  user: {
    userId: 7,
    account: "snow",
    permissionKeys: ["member:favorite:toggle"],
  } as { userId: number; account: string; permissionKeys: string[] } | null,
  active: true,
  busy: false,
  needsReview: false,
  query: {} as Record<string, unknown>,
  options: null as Record<string, unknown> | null,
  view: null as ComponentProps<typeof ArticleDetailView> | null,
  set: vi.fn(),
  review: vi.fn(),
  refetch: vi.fn(),
  push: vi.fn(),
}));
vi.mock("../../platform/auth/session-provider", () => ({
  useAuthSession: () => ({ user: state.user, status: state.status }),
}));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => state.epoch,
  assertSessionEpoch: vi.fn(),
}));
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ articleId: state.route }),
  useRouter: () => ({ push: state.push }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    state.options = options;
    return state.query;
  },
}));
vi.mock("../favorites/use-favorite-run", () => ({
  useFavoriteRun: () => ({
    run: { set: state.set, review: state.review },
    state: {
      busy: state.busy,
      pending: null,
      needsReview: state.needsReview,
      notice: null,
    },
    focus: { active: state.active, revision: 4 },
  }),
}));
vi.mock("./article-detail-view", async (original) => {
  const actual = await original<typeof import("./article-detail-view")>();
  return {
    ArticleDetailView: (props: ComponentProps<typeof ArticleDetailView>) => {
      state.view = props;
      return createElement(actual.ArticleDetailView, props);
    },
  };
});
vi.mock("react-native", () => ({
  useColorScheme: () => "light",
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("main", null, children),
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
  Pressable: ({
    children,
    disabled,
  }: {
    children?: ReactNode;
    disabled?: boolean;
  }) => createElement("button", { disabled }, children),
  Image: () => null,
  ActivityIndicator: () => createElement("i", null, "loading"),
  StyleSheet: { create: (value: unknown) => value },
}));
import Screen from "./article-detail-screen";
import { ApiError } from "../../platform/api/api-error";
const article = {
  articleId: 11,
  title: "SYNTHETIC-TITLE",
  summary: "summary",
  body: "SYNTHETIC-BODY",
  coverUrl: null,
  authorName: null,
  category: { value: "safety", label: "Safety" },
  publishTime: "2026-11-02T00:00:00Z",
  favoriteByMe: false,
};
const render = () => renderToStaticMarkup(createElement(Screen));
beforeEach(() => {
  vi.clearAllMocks();
  state.epoch = 8;
  state.route = "11";
  state.status = "authenticated";
  state.user = {
    userId: 7,
    account: "snow",
    permissionKeys: ["member:favorite:toggle"],
  };
  state.active = true;
  state.busy = false;
  state.needsReview = false;
  state.query = {
    data: article,
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: state.refetch,
  };
  state.options = null;
  state.view = null;
});
describe("article detail page wiring with Native/Router/Query replacements", () => {
  it.each(["restoring", "blurred", "invalid"])(
    "hides cached content and disables reads while %s",
    (mode) => {
      if (mode === "restoring") state.status = "restoring";
      if (mode === "blurred") state.active = false;
      if (mode === "invalid") state.route = ["11", "12"];
      expect(render()).not.toContain(article.body);
      expect(state.options!.enabled).toBe(false);
      state.view!.onFavorite(true);
      state.view!.onReload();
      expect(state.set).not.toHaveBeenCalled();
      expect(state.refetch).not.toHaveBeenCalled();
    },
  );
  it.each([401, 403, 404, 500])("hides old detail after %s", (status) => {
    state.query.isError = true;
    state.query.error = new ApiError("failed", {
      status,
      code: null,
      traceId: null,
    });
    expect(render()).not.toContain(article.body);
    state.view!.onFavorite(true);
    expect(state.set).not.toHaveBeenCalled();
  });
  it("supports read-only and guest display without permitting a favorite", () => {
    state.user!.permissionKeys = [];
    expect(render()).toContain(article.body);
    state.view!.onFavorite(true);
    expect(state.set).not.toHaveBeenCalled();
    state.user = null;
    expect(render()).toContain("登录后收藏文章");
    state.view!.onLogin();
    expect(state.push).toHaveBeenCalledWith("/auth");
  });
  it("preserves the fixed cache boundary and avoids unattended retries", () => {
    render();
    expect(state.options).toMatchObject({
      queryKey: ["public-article", 7, "11", 8, 4],
      staleTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
  });
  it("remounts the workspace on same-account login, changed grants, route or restoring state", () => {
    const first = Screen().key;
    state.epoch++;
    expect(Screen().key).not.toBe(first);
    state.epoch = 8;
    state.user!.permissionKeys = [];
    expect(Screen().key).not.toBe(first);
    state.user!.permissionKeys = ["member:favorite:toggle"];
    state.route = "12";
    expect(Screen().key).not.toBe(first);
    state.route = "11";
    state.status = "restoring";
    expect(Screen().key).not.toBe(first);
  });
  it("sends the explicit desired state and guards loading/unknown results", () => {
    render();
    state.view!.onFavorite(true);
    expect(state.set).toHaveBeenCalledWith(
      { targetType: "article", targetId: 11 },
      true,
    );
    state.set.mockClear();
    state.query.isFetching = true;
    render();
    state.view!.onFavorite(true);
    expect(state.set).not.toHaveBeenCalled();
    state.query.isFetching = false;
    state.needsReview = true;
    render();
    state.view!.onFavorite(false);
    expect(state.set).not.toHaveBeenCalled();
    state.view!.onReview();
    expect(state.review).toHaveBeenCalledTimes(1);
  });
});
