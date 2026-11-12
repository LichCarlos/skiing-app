import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleDetailView } from "./article-detail-view";
import { ApiError } from "../../platform/api/api-error";
vi.mock("react-native", () => ({
  useColorScheme: () => "light",
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("main", null, children),
  Text: ({
    children,
    accessibilityRole,
  }: {
    children?: ReactNode;
    accessibilityRole?: string;
  }) => createElement("span", { role: accessibilityRole }, children),
  Image: ({ source }: { source: { uri: string } }) =>
    createElement("img", { src: source.uri }),
  Pressable: ({
    children,
    disabled,
  }: {
    children?: ReactNode;
    disabled?: boolean;
  }) => createElement("button", { disabled }, children),
  ActivityIndicator: ({ accessibilityLabel }: { accessibilityLabel: string }) =>
    createElement("span", { role: "status" }, accessibilityLabel),
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("expo-router", () => ({ Link: ({children}: {children?: ReactNode}) => createElement("a", null, children) }));
let props: ComponentProps<typeof ArticleDetailView>;
beforeEach(() => {
  props = {
    valid: true,
    active: true,
    restoring: false,
    loading: false,
    fetching: false,
    article: {
      articleId: 11,
      title: "SYNTHETIC-ARTICLE",
      summary: "synthetic summary",
      body: "SYNTHETIC-BODY",
      category: { value: "snow", label: "滑雪" },
      coverUrl: null,
      authorName: null,
      publishTime: "2026-11-02T00:00:00Z",
      favoriteByMe: false,
    },
    error: null,
    favorite: { busy: false, needsReview: false, pending: null, notice: null },
    loggedIn: true,
    canFavorite: true,
    onLogin: vi.fn(),
    onReload: vi.fn(),
    onReview: vi.fn(),
    onFavorite: vi.fn(),
  };
});
const html = () =>
  renderToStaticMarkup(createElement(ArticleDetailView, props));
describe("article lifecycle display with Native rendering substitutes", () => {
  it.each(["inactive", "restoring", "loading", "invalid"])(
    "hides cached content and actions while %s",
    (mode) => {
      if (mode === "inactive") props.active = false;
      if (mode === "restoring") props.restoring = true;
      if (mode === "loading") props.loading = true;
      if (mode === "invalid") props.valid = false;
      expect(html()).not.toContain("SYNTHETIC-BODY");
      expect(html()).not.toContain("收藏文章");
    },
  );
  it.each([401, 403, 404, 500])(
    "hides stale cached body after HTTP %s",
    (status) => {
      props.error = new ApiError("failed", {
        status,
        code: null,
        traceId: null,
      });
      expect(html()).not.toContain("SYNTHETIC-BODY");
      expect(html()).toContain(status === 404 ? "已下架" : "加载失败");
    },
  );
  it("keeps a read-only account able to read without a write control", () => {
    props.canFavorite = false;
    expect(html()).toContain("SYNTHETIC-BODY");
    expect(html()).toContain("没有收藏权限");
    expect(html()).not.toContain(">收藏文章<");
  });
  it("gives guests a login entry", () => {
    props.loggedIn = false;
    props.canFavorite = false;
    expect(html()).toContain("登录后收藏文章");
  });
  it("does not substitute an unrelated remote image for a missing cover", () => {
    expect(html()).toContain("暂无封面");
    expect(html()).not.toContain("<img");
  });
  it("does not claim a saved favorite during a refetch", () => {
    props.fetching = true;
    props.article!.favoriteByMe = true;
    expect(html()).toContain("正在核对收藏状态");
    expect(html()).not.toContain("已收藏 · 取消收藏");
  });
  it("keeps unknown-result recovery visible even when the target is unavailable", () => {
    props.error = new ApiError("missing", {
      status: 404,
      code: null,
      traceId: null,
    });
    props.favorite = {
      busy: false,
      needsReview: true,
      pending: { targetType: "article", targetId: 11 },
      notice: "结果尚未确认",
    };
    expect(html()).toContain("核对上次操作的收藏状态");
    expect(html()).toContain("结果尚未确认");
    expect(html()).not.toContain("SYNTHETIC-BODY");
  });
});
