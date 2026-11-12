import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  epoch: 8,
  route: "12" as unknown,
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
  buttons: [] as {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }[],
  set: vi.fn(),
  review: vi.fn(),
  refetch: vi.fn(),
  more: vi.fn(),
  push: vi.fn(),
  read: vi.fn(),
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
  useLocalSearchParams: () => ({ resortId: state.route }),
  useRouter: () => ({ push: state.push, back: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    state.options = options;
    return state.query;
  },
  useInfiniteQuery: (options: Record<string, unknown>) => {
    state.options = options;
    return state.query;
  },
}));
vi.mock("./use-favorite-run", () => ({
  useFavoriteRun: () => ({
    run: { set: state.set, review: state.review, read: state.read },
    state: {
      busy: state.busy,
      pending: null,
      needsReview: state.needsReview,
      notice: null,
    },
    focus: { active: state.active, revision: 4 },
  }),
}));
vi.mock("../../../components/Themed", () => ({
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("react-native", () => ({
  useColorScheme: () => "light",
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("main", null, children),
  Pressable: (props: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => {
    state.buttons.push(props);
    return createElement(
      "button",
      { disabled: props.disabled },
      props.children,
    );
  },
  Image: () => null,
  ActivityIndicator: () => createElement("i", null, "loading"),
  StyleSheet: { create: (v: unknown) => v, hairlineWidth: 1 },
  Linking: { openURL: vi.fn() },
}));
import ResortScreen from "../resorts/resort-detail-screen";
import FavoritesScreen from "./favorites-screen";
import { resortDetail } from "../../../test/fixtures/resort-detail";
import { ApiError } from "../../platform/api/api-error";
const row = {
  favoriteId: "1",
  targetType: "resort",
  favoritedAt: resortDetail.updatedAt,
  target: {
    targetType: "resort",
    id: 12,
    name: "SYNTHETIC-FAVORITE",
    province: null,
    city: null,
    district: null,
    rating: 0,
    startingPrice: "0",
  },
};
const render = (screen: typeof ResortScreen | typeof FavoritesScreen) => {
  state.buttons = [];
  return renderToStaticMarkup(createElement(screen));
};
const press = (label: string) => {
  const button = state.buttons.find((b) =>
    renderToStaticMarkup(createElement("span", null, b.children)).includes(
      label,
    ),
  );
  expect(button, label).toBeDefined();
  button!.onPress?.();
};
beforeEach(() => {
  vi.clearAllMocks();
  state.epoch = 8;
  state.route = "12";
  state.status = "authenticated";
  state.user = {
    userId: 7,
    account: "snow",
    permissionKeys: ["member:favorite:toggle"],
  };
  state.active = true;
  state.busy = false;
  state.needsReview = false;
  state.buttons = [];
  state.query = {
    data: resortDetail,
    isError: false,
    isPending: false,
    isFetching: false,
    isRefetching: false,
    hasNextPage: true,
    refetch: state.refetch,
    fetchNextPage: state.more,
  };
  state.options = null;
});
describe("resort and own favorites page wiring with Native/Router/Query replacements", () => {
  it.each(["restoring", "blurred", "invalid"])(
    "resort hides cached detail and stops reads when %s",
    (mode) => {
      if (mode === "restoring") state.status = "restoring";
      if (mode === "blurred") state.active = false;
      if (mode === "invalid") state.route = ["12", "13"];
      expect(render(ResortScreen)).not.toContain(resortDetail.description);
      expect(state.options!.enabled).toBe(false);
    },
  );
  it.each([401, 403, 404, 500])(
    "resort hides old content on %s even when cached",
    (status) => {
      state.query.isError = true;
      state.query.error = new ApiError("failed", {
        status,
        code: null,
        traceId: null,
      });
      expect(render(ResortScreen)).not.toContain(resortDetail.description);
      expect(state.set).not.toHaveBeenCalled();
    },
  );
  it("resort permits read-only guests and sends explicit cancellation for an existing favorite", () => {
    expect(render(ResortScreen)).toContain(resortDetail.description);
    press("已收藏，点击取消");
    expect(state.set).toHaveBeenCalledExactlyOnceWith(
      { targetType: "resort", targetId: 12 },
      false,
    );
    state.set.mockClear();
    state.user = null;
    expect(render(ResortScreen)).toContain("登录后收藏雪场");
    expect(state.set).not.toHaveBeenCalled();
  });
  it("resort keeps epoch/focus in query key and allows only review for unknown results", () => {
    state.needsReview = true;
    render(ResortScreen);
    expect(state.options).toMatchObject({
      queryKey: ["public-resort", 7, 12, 8, 4],
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
    press("已收藏，点击取消");
    expect(state.set).not.toHaveBeenCalled();
    press("核对上次操作");
    expect(state.review).toHaveBeenCalledOnce();
  });
  it.each([ResortScreen, FavoritesScreen])(
    "remounts workspace for new login, grants or restoration",
    (Screen) => {
      const key = Screen().key;
      state.epoch++;
      expect(Screen().key).not.toBe(key);
      state.epoch = 8;
      state.user!.permissionKeys = [];
      expect(Screen().key).not.toBe(key);
      state.user!.permissionKeys = ["member:favorite:toggle"];
      state.status = "restoring";
      expect(Screen().key).not.toBe(key);
    },
  );
  it.each(["restoring", "blurred", "revoked", "guest", "error"])(
    "favorites hides old rows and stops unauthorized/inactive reads when %s",
    (mode) => {
      state.query.data = { pages: [{ items: [row] }] };
      if (mode === "restoring") state.status = "restoring";
      if (mode === "blurred") state.active = false;
      if (mode === "revoked") state.user!.permissionKeys = [];
      if (mode === "guest") state.user = null;
      if (mode === "error") state.query.isError = true;
      expect(render(FavoritesScreen)).not.toContain(row.target.name);
      if (mode !== "error") expect(state.options!.enabled).toBe(false);
    },
  );
  it("favorites binds epoch/focus and guards cancellation until read-only review", () => {
    state.query.data = { pages: [{ items: [row] }] };
    state.needsReview = true;
    expect(render(FavoritesScreen)).toContain(row.target.name);
    expect(state.options).toMatchObject({
      queryKey: ["member-favorites", 7, 8, "all", 4],
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
    press("移除");
    expect(state.set).not.toHaveBeenCalled();
    press("核对上次操作");
    expect(state.review).toHaveBeenCalledOnce();
    state.needsReview = false;
    render(FavoritesScreen);
    press("移除");
    expect(state.set).toHaveBeenCalledExactlyOnceWith(
      { targetType: "resort", targetId: 12 },
      false,
    );
  });
  it("favorites loads next page only when a page remains and no read is in flight", () => {
    state.query.data = { pages: [{ items: [row] }] };
    render(FavoritesScreen);
    press("加载更多");
    expect(state.more).toHaveBeenCalledOnce();
    state.more.mockClear();
    state.query.isFetching = true;
    render(FavoritesScreen);
    press("加载更多");
    expect(state.more).not.toHaveBeenCalled();
  });
});
