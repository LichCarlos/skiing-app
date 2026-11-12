import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnDynamicDetailView } from "./own-dynamic-detail";
import { OwnDynamicsAccess } from "./own-dynamics-ui";
import { useAuthSession } from "../../platform/auth/session-provider";
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
  Pressable: ({
    children,
    disabled,
  }: {
    children?: ReactNode;
    disabled?: boolean;
  }) => createElement("button", { disabled }, children),
  ActivityIndicator: ({ accessibilityLabel }: { accessibilityLabel: string }) =>
    createElement("span", { role: "status" }, accessibilityLabel),
  Image: ({ accessibilityLabel }: { accessibilityLabel: string }) =>
    createElement("span", null, accessibilityLabel),
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("expo-router", () => ({
  Link: ({ children, href }: { children?: ReactNode; href: unknown }) =>
    createElement(
      "a",
      { href: typeof href === "string" ? href : JSON.stringify(href) },
      children,
    ),
}));
vi.mock("../../platform/auth/session-provider", () => ({
  useAuthSession: vi.fn(),
}));
let props: ComponentProps<typeof OwnDynamicDetailView>;
beforeEach(() => {
  props = {
    id: 12,
    state: {
      ready: true,
      busy: false,
      uncertain: false,
      reviewed: false,
      error: null,
    },
    item: {
      dynamicId: 12,
      author: { userId: 7, nickname: "本人", avatarUrl: null },
      content: "PRIVATE-OWN-CONTENT",
      summary: "PRIVATE-SUMMARY",
      coverUrl: null,
      imageCount: 1,
      imageUrls: ["https://example.test/synthetic.webp"],
      images: [],
      resort: null,
      likeCount: 1,
      commentCount: 2,
      likedByMe: false,
      status: "pending",
      createdAt: "2026-11-02T00:00:00Z",
      updatedAt: "2026-11-02T00:00:00Z",
    },
    error: null,
    loading: false,
    fetching: false,
    confirmDelete: false,
    canWrite: true,
    onReload: vi.fn(),
    onReviewed: vi.fn(),
    onDelete: vi.fn(),
    onConfirm: vi.fn(),
  };
});
const html = () =>
  renderToStaticMarkup(createElement(OwnDynamicDetailView, props));
describe("own dynamic detail view (Native and Router render substitutes)", () => {
  it.each(["pending", "published", "hidden"] as const)(
    "renders protected %s content but only links published content publicly",
    (status) => {
      props.item!.status = status;
      const result = html();
      expect(result).toContain("PRIVATE-OWN-CONTENT");
      expect(result).toContain("动态图片 1");
      expect(result).toContain("编辑动态");
      expect(result.includes("查看公开动态与评论")).toBe(
        status === "published",
      );
    },
  );
  it("shows only explicit confirmation before deletion", () => {
    expect(html()).not.toContain("确认删除</span>");
    props.confirmDelete = true;
    expect(html()).toContain("确认删除</span>");
    expect(html()).toContain("取消");
  });
  it("hides write controls for read-only accounts", () => {
    props.canWrite = false;
    expect(html()).not.toContain("编辑动态");
    expect(html()).not.toContain("删除动态");
    expect(html()).toContain("PRIVATE-OWN-CONTENT");
  });
  it.each([401, 403, 404])(
    "hides stale private cache for HTTP %s",
    (status) => {
      props.error = new ApiError("error", {
        status,
        code: null,
        traceId: null,
      });
      const result = html();
      expect(result).not.toContain("PRIVATE-OWN-CONTENT");
      expect(result).not.toContain("编辑动态");
      expect(result).toContain("重试");
    },
  );
  it.each(["loading", "fetching", "not-ready"])(
    "hides stale private content while %s",
    (mode) => {
      if (mode === "loading") props.loading = true;
      if (mode === "fetching") props.fetching = true;
      if (mode === "not-ready") props.state = { ...props.state, ready: false };
      expect(html()).not.toContain("PRIVATE-OWN-CONTENT");
    },
  );
  it("blocks edits and deletion until unknown write review is explicitly acknowledged", () => {
    props.state = {
      ...props.state,
      uncertain: true,
      reviewed: false,
      error: "结果尚未确认",
    };
    expect(html()).not.toContain("编辑动态");
    expect(html()).not.toContain("已核对动态仍存在");
    expect(html()).toMatch(/<button disabled=""><span>删除动态/);
    props.state = { ...props.state, reviewed: true };
    expect(html()).toContain("已核对动态仍存在，允许重新操作");
  });
  it("keeps a useful reload and return route for deleted or inaccessible content", () => {
    props.item = undefined;
    props.error = new ApiError("gone", {
      status: 404,
      code: null,
      traceId: null,
    });
    expect(html()).toContain("动态已删除或不属于当前账号");
    expect(html()).toContain("刷新并核对动态");
    expect(html()).toContain('href="/profile/dynamics"');
  });
});
describe("own dynamic account gate", () => {
  it.each([
    { status: "restoring", user: null, expected: "正在恢复登录" },
    { status: "anonymous", user: null, expected: "登录后查看本人动态" },
    {
      status: "authenticated",
      user: { userId: 7, permissionKeys: [] },
      expected: "当前账号没有查看本人动态的权限",
    },
  ])(
    "hides children for $status without granted read",
    ({ expected, ...session }) => {
      vi.mocked(useAuthSession).mockReturnValue(
        session as ReturnType<typeof useAuthSession>,
      );
      const result = renderToStaticMarkup(
        createElement(OwnDynamicsAccess, null, "PRIVATE-CHILD"),
      );
      expect(result).not.toContain("PRIVATE-CHILD");
      expect(result).toContain(expected);
    },
  );
  it("allows the granted account without checking a business role name", () => {
    vi.mocked(useAuthSession).mockReturnValue({
      status: "authenticated",
      user: { userId: 7, permissionKeys: ["community:dynamic:read-own"] },
    } as ReturnType<typeof useAuthSession>);
    expect(
      renderToStaticMarkup(
        createElement(OwnDynamicsAccess, null, "PRIVATE-CHILD"),
      ),
    ).toContain("PRIVATE-CHILD");
  });
});
