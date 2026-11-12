import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationTimeline } from "./conversation-timeline";
import { AiAccess } from "./ai-ui";
import { useAuthSession } from "../../platform/auth/session-provider";
import type { AiRunState } from "./conversation-run";
import type { AiMessage } from "./ai-api";
import { ApiError } from "../../platform/api/api-error";

vi.mock("react-native", () => ({
  useColorScheme: () => "light",
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  Text: ({
    children,
    accessibilityRole,
  }: {
    children?: ReactNode;
    accessibilityRole?: string;
  }) => createElement("span", { role: accessibilityRole }, children),
  Pressable: ({ children }: { children?: ReactNode }) =>
    createElement("button", null, children),
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
const message: AiMessage = {
  messageId: "12",
  role: "assistant",
  status: "complete",
  content: "已保存的回答 [S1]",
  citations: [
    {
      sourceType: "resort",
      sourceId: "7",
      title: "雪场",
      excerpt: "公开来源",
      href: "https://untrusted.test",
    },
  ],
  createdAt: "2026-10-31T00:00:00Z",
};
const initial: AiRunState = {
  pending: null,
  partial: "",
  sending: false,
  error: null,
  confirmed: [],
};
const request = { clientRequestId: "request-1", content: "相同问题" };
function timeline(
  state = initial,
  messages: AiMessage[] | undefined = [],
  loadError: unknown = null,
  loading = false,
) {
  return renderToStaticMarkup(
    createElement(ConversationTimeline, {
      state,
      messages,
      loadError,
      loading,
      onReload: vi.fn(),
      onRetry: vi.fn(),
      onEdit: vi.fn(),
      onStop: vi.fn(),
    }),
  );
}
const user = {
  userId: 7,
  account: "snow",
  nickname: "Snow",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [],
  permissionKeys: ["ai:conversation:use"],
};
beforeEach(() => {
  vi.mocked(useAuthSession).mockReturnValue({
    status: "authenticated",
    user,
    retryRestore: vi.fn(),
  } as unknown as ReturnType<typeof useAuthSession>);
});
describe("AI timeline rendering", () => {
  it("hides cached history and original retry when the send path detects revoked access", () => {
    const html = timeline(
      {
        ...initial,
        denied: true,
        pending: request,
        partial: "private-partial",
        confirmed: [{ request, message }],
        error: "当前账号尚未获准使用 AI",
      },
      [message],
    );
    expect(html).not.toContain(message.content);
    expect(html).not.toContain("private-partial");
    expect(html).not.toContain("使用原请求重试");
    expect(html).toContain("当前账号尚未获准使用 AI");
  });
  it.each([401, 403, 404])(
    "hides cached history and local answer after an authorization/ownership %s failure",
    (status) => {
      const html = timeline(
        {
          ...initial,
          pending: request,
          partial: "private-partial",
          confirmed: [{ request, message }],
        },
        [message],
        new ApiError("private-detail", { status, code: null, traceId: null }),
      );
      expect(html).toContain("重新加载");
      expect(html).not.toContain(message.content);
      expect(html).not.toContain("private-partial");
      expect(html).not.toContain("使用原请求重试");
    },
  );
  it("keeps a confirmed reply visible when history reload fails", () => {
    const html = timeline(
      { ...initial, confirmed: [{ request, message }] },
      undefined,
      new Error("offline"),
    );
    expect(html).toContain("重新加载");
    expect(html).toContain(message.content);
    expect(html).toContain("本轮提问");
    expect(html).not.toContain("回答尚未确认完成");
    expect(html).not.toContain("使用原请求重试");
  });
  it("does not duplicate a confirmed reply already present in authoritative history", () => {
    const html = timeline({ ...initial, confirmed: [{ request, message }] }, [
      message,
    ]);
    expect(html.split(message.content)).toHaveLength(2);
    expect(html).not.toContain("本轮提问");
  });
  it("does not suppress another identical question based on history content", () => {
    const oldUser = {
      ...message,
      messageId: "9",
      role: "user" as const,
      content: request.content,
      citations: [],
    };
    const html = timeline({ ...initial, pending: request }, [oldUser]);
    expect(html.split(request.content)).toHaveLength(3);
    expect(html).toContain("本轮提问");
    expect(html).toContain("使用原请求重试");
  });
  it("shows partial output as unconfirmed with stop while running", () => {
    const html = timeline({
      ...initial,
      pending: request,
      partial: "临时片段",
      sending: true,
    });
    expect(html).toContain("临时片段");
    expect(html).toContain("停止回答");
    expect(html).not.toContain("使用原请求重试");
  });
  it("shows retry and edit after stop or stream error, even if history fails", () => {
    const html = timeline(
      { ...initial, pending: request, partial: "未保存", error: "已停止" },
      undefined,
      new Error("offline"),
    );
    expect(html).toContain("使用原请求重试");
    expect(html).toContain("编辑后重新提问");
    expect(html).toContain("回答尚未确认完成");
  });
  it("uses matching S references and only known public routes", () => {
    const html = timeline(initial, [message]);
    expect(html).toContain("[S1]");
    expect(html).toContain('href="/resorts/7"');
    expect(html).not.toContain("untrusted.test");
  });
  it("escapes source and answer text rather than interpreting markup", () => {
    const html = timeline(initial, [
      { ...message, content: "<script>bad</script>" },
    ]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("renders initial loading and empty conversation states", () => {
    expect(timeline(initial, undefined, null, true)).toContain("加载对话");
    expect(timeline()).toContain("第一次滑雪");
  });
});
describe("AI access boundary", () => {
  const render = () =>
    renderToStaticMarkup(createElement(AiAccess, null, "private-conversation"));
  it("allows a logged-in account with use permission", () => {
    expect(render()).toContain("private-conversation");
  });
  it.each(["restoring", "anonymous"] as const)(
    "hides children during %s even with stale user data",
    (status) => {
      vi.mocked(useAuthSession).mockReturnValue({
        status,
        user,
        retryRestore: vi.fn(),
      } as unknown as ReturnType<typeof useAuthSession>);
      expect(render()).not.toContain("private-conversation");
    },
  );
  it("hides AI children when permission is missing and provides identity recovery", () => {
    vi.mocked(useAuthSession).mockReturnValue({
      status: "authenticated",
      user: { ...user, permissionKeys: [] },
      retryRestore: vi.fn(),
    } as unknown as ReturnType<typeof useAuthSession>);
    expect(render()).toContain("重新读取身份");
    expect(render()).not.toContain("private-conversation");
  });
});
