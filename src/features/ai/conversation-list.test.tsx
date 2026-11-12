import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationListView } from "./conversation-list";
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
    disabled: boolean;
  }) => createElement("button", { disabled }, children),
  ActivityIndicator: ({ accessibilityLabel }: { accessibilityLabel: string }) =>
    createElement("span", { role: "status" }, accessibilityLabel),
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("expo-router", () => ({
  Link: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("../../platform/auth/session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("../../platform/api/api-client", () => ({
  apiRequest: vi.fn(),
  apiStreamRequest: vi.fn(),
}));

const id = "e9b35d28-193f-46f6-bdf4-dd6c9194ad25";
let props: ComponentProps<typeof ConversationListView>;
beforeEach(() => {
  props = {
    state: {
      busy: null,
      error: null,
      uncertain: false,
      reviewed: false,
      ready: true,
    },
    data: {
      items: [
        {
          conversationId: id,
          title: "我的私密提问",
          status: "active",
          createdAt: "2026-10-31T00:00:00Z",
          updatedAt: "2026-10-31T00:00:00Z",
          messageCount: 2,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    },
    page: 1,
    error: null,
    loading: false,
    fetching: false,
    deleteId: null,
    onCreate: vi.fn(),
    onDelete: vi.fn(),
    onConfirm: vi.fn(),
    onPage: vi.fn(),
    onReload: vi.fn(),
    onReviewed: vi.fn(),
  };
});
const render = () =>
  renderToStaticMarkup(createElement(ConversationListView, props));
function button(html: string, label: string) {
  return [...html.matchAll(/<button\b[^>]*>.*?<\/button>/gs)].find(([markup]) =>
    markup.includes(label),
  )?.[0];
}
describe("AI list static native view", () => {
  it("renders account list and only a canonical conversation destination", () => {
    const html = render();
    expect(html).toContain(`href="/ai/${id}"`);
    expect(html).toContain("2 条消息");
    expect(button(html, "新建对话")).not.toContain("disabled");
  });
  it("does not display cached records before a fresh focus identity read completes", () => {
    props.state = { ...props.state, ready: false };
    props.fetching = true;
    const html = render();
    expect(html).not.toContain("我的私密提问");
    expect(html).toContain("加载会话");
    expect(button(html, "新建对话")).toContain("disabled");
  });
  it.each([401, 403, 404, 500])(
    "hides stale records on read failure %s and provides refresh",
    (status) => {
      props.error = new ApiError("private", {
        status,
        code: null,
        traceId: null,
      });
      const html = render();
      expect(html).not.toContain("我的私密提问");
      expect(html).toContain("刷新列表");
      expect(button(html, "新建对话")).toContain("disabled");
    },
  );
  it("shows the empty state and keeps both page buttons disabled", () => {
    props.data = { ...props.data!, items: [], total: 0 };
    const html = render();
    expect(html).toContain("暂无对话");
    expect(html).toContain("1 / 1");
    expect(button(html, "上一页")).toContain("disabled");
    expect(button(html, "下一页")).toContain("disabled");
  });
  it("shows soft deletion confirmation before exposing the destructive action", () => {
    expect(render()).not.toContain("确认删除");
    props.deleteId = id;
    const html = render();
    expect(html).toContain("将从列表隐藏");
    expect(html).toContain("确认删除");
    expect(html).toContain("取消");
  });
  it.each(["create", "delete"] as const)(
    "locks navigation, pagination and all writes during %s",
    (busy) => {
      props.state = { ...props.state, busy };
      props.deleteId = id;
      props.data = { ...props.data!, total: 40 };
      const html = render();
      expect(html).not.toContain('href="/ai/');
      for (const [markup] of html.matchAll(/<button\b[^>]*>.*?<\/button>/gs))
        expect(markup).toContain("disabled");
      expect(html).toContain(busy === "create" ? "正在创建…" : "删除中…");
    },
  );
  it("allows pagination to inspect an uncertain result but requires a fresh read to acknowledge", () => {
    props.state = {
      ...props.state,
      uncertain: true,
      error: "操作结果尚未确认",
    };
    props.data = { ...props.data!, total: 40 };
    let html = render();
    expect(button(html, "新建对话")).toContain("disabled");
    expect(button(html, "下一页")).not.toContain("disabled");
    expect(button(html, "已核对列表")).toContain("disabled");
    props.state = { ...props.state, reviewed: true };
    html = render();
    expect(button(html, "已核对列表")).not.toContain("disabled");
    expect(html).toContain("继续新建可能产生重复会话");
  });
  it("disables acknowledgement and writes while a fresh page request is running", () => {
    props.state = { ...props.state, uncertain: true, reviewed: true };
    props.fetching = true;
    const html = render();
    expect(button(html, "已核对列表")).toContain("disabled");
    expect(button(html, "新建对话")).toContain("disabled");
  });
  it.each(["create", "delete"] as const)(
    "explains a detached %s task and blocks acknowledgement even with stale reviewed state",
    (busy) => {
      props.state = { ...props.state, uncertain: true, reviewed: true, busy };
      const html = render();
      expect(html).toContain("上次请求仍在结束");
      expect(button(html, "已核对列表")).toContain("disabled");
      expect(button(html, "刷新列表")).toContain("disabled");
    },
  );
  it("does not display a previous page's cached records", () => {
    props.page = 2;
    expect(render()).not.toContain("我的私密提问");
  });
  it("escapes titles and disables malformed route IDs", () => {
    props.data!.items[0] = {
      ...props.data!.items[0],
      title: "<script>snow</script>",
      conversationId: "../settings",
    };
    const html = render();
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="/ai/');
    expect(button(html, "删除会话")).toContain("disabled");
  });
});
