import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../platform/api/api-error";
import type { FavoriteState } from "../favorites/favorite-run";
import type { ResortPage } from "./resort-query";
const model = vi.hoisted(() => ({
  user: null as {
    userId: number;
    account: string;
    permissionKeys: string[];
  } | null,
  status: "authenticated",
  focus: { active: true, revision: 1 },
  favorite: {} as FavoriteState,
  list: {} as Record<string, unknown>,
}));
vi.mock("../../platform/auth/session-provider", () => ({
  useAuthSession: () => ({ user: model.user, status: model.status }),
}));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => 12,
}));
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
vi.mock("../favorites/use-favorite-run", () => ({
  useFavoriteRun: () => ({
    state: model.favorite,
    focus: model.focus,
    run: { set: vi.fn(), review: vi.fn() },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], isError: false }),
  useInfiniteQuery: () => model.list,
  useQueryClient: () => ({ resetQueries: vi.fn(), cancelQueries: vi.fn() }),
}));
vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
  useFocusEffect: vi.fn(),
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
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
  TextInput: () => createElement("input"),
  Pressable: ({
    children,
    disabled,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    accessibilityLabel?: string;
  }) =>
    createElement(
      "button",
      { disabled, "aria-label": accessibilityLabel },
      children,
    ),
  ActivityIndicator: ({
    accessibilityLabel,
  }: {
    accessibilityLabel?: string;
  }) =>
    createElement("span", { role: "status" }, accessibilityLabel ?? "Loading"),
  Image: () => createElement("span", null, "Image"),
  RefreshControl: () => null,
  StyleSheet: { create: (value: unknown) => value },
}));
import ResortsScreen from "./resorts-screen";
const page: ResortPage = {
  page: 1,
  pageSize: 20,
  total: 2,
  hasNext: false,
  items: [1, 2].map((resortId) => ({
    resortId,
    name: `Protected card ${resortId}`,
    region: { province: "Test", city: "Test City", district: null },
    coverUrl: null,
    rating: 4.5,
    ratingCount: 1,
    distanceMeters: 0,
    startingPrice: "100",
    fitTags: [],
    openStatus: "open",
    favoriteByMe: false,
    customFields: [],
  })),
};
beforeEach(() => {
  model.user = {
    userId: 7,
    account: "snow",
    permissionKeys: ["member:favorite:toggle"],
  };
  model.status = "authenticated";
  model.focus = { active: true, revision: 1 };
  model.favorite = {
    busy: false,
    needsReview: false,
    pending: null,
    notice: null,
  };
  model.list = {
    data: { pages: [page] },
    isPending: false,
    isError: false,
    isRefetchError: false,
    isFetchNextPageError: false,
    isFetching: false,
    hasNextPage: false,
  };
});
const html = () => renderToStaticMarkup(createElement(ResortsScreen));
const favoriteButtons = (value: string) =>
  value.match(/<button[^>]*aria-label="(?:收藏雪场|取消收藏)"[^>]*>/g) ?? [];
describe("resort list rendering with Native/Router/Query hook substitutes", () => {
  it("renders public cards, real zero distance and enabled member actions", () => {
    const value = html();
    expect(value).toContain("Protected card 1");
    expect(value).toContain("0 米");
    expect(favoriteButtons(value)).toHaveLength(2);
    expect(
      favoriteButtons(value).some((button) => button.includes("disabled")),
    ).toBe(false);
  });
  it.each(["inactive", "restoring"])(
    "does not render old cards during %s",
    (mode) => {
      if (mode === "inactive") model.focus.active = false;
      else model.status = "restoring";
      const value = html();
      expect(value).not.toContain("Protected card");
      expect(favoriteButtons(value)).toHaveLength(0);
    },
  );
  it.each([401, 403])(
    "hides cached personalized cards after identity read denial %s",
    (status) => {
      model.list.isError = true;
      model.list.error = new ApiError("denied", {
        status,
        code: null,
        traceId: null,
      });
      const value = html();
      expect(value).not.toContain("Protected card");
      expect(value).toContain("登录账号已变化");
      expect(favoriteButtons(value)).toHaveLength(0);
    },
  );
  it.each(["guest", "no-grant"])(
    "%s sees public cards without member controls",
    (mode) => {
      if (mode === "guest") {
        model.user = null;
        model.status = "anonymous";
      } else model.user!.permissionKeys = [];
      const value = html();
      expect(value).toContain("Protected card 1");
      expect(favoriteButtons(value)).toHaveLength(0);
    },
  );
  it("busy blocks every card, including a different resort", () => {
    model.favorite = {
      ...model.favorite,
      busy: true,
      pending: { targetType: "resort", targetId: 1 },
    };
    expect(
      favoriteButtons(html()).every((button) => button.includes("disabled")),
    ).toBe(true);
  });
  it("unknown result blocks all writes and renders read-only review", () => {
    model.favorite = {
      ...model.favorite,
      needsReview: true,
      pending: { targetType: "resort", targetId: 1 },
      notice: "Unconfirmed favorite",
    };
    const value = html();
    expect(value).toContain("Unconfirmed favorite");
    expect(value).toContain("核对上次操作");
    expect(
      favoriteButtons(value).every((button) => button.includes("disabled")),
    ).toBe(true);
  });
  it("retains existing rows on refresh failure and gives separate page retry feedback", () => {
    model.list.isRefetchError = true;
    expect(html()).toContain("刷新失败，点击重试");
    expect(html()).toContain("Protected card 1");
    model.list.isFetchNextPageError = true;
    model.list.hasNextPage = true;
    const value = html();
    expect(value).toContain("加载更多失败，点击重试");
    expect(value).not.toContain("刷新失败，点击重试");
  });
});
