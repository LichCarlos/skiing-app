import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../platform/api/api-error";
const model = vi.hoisted(() => ({
  focused: true,
  denied: false,
  route: "e9b35d28-193f-46f6-bdf4-dd6c9194ad25" as unknown,
  query: {} as Record<string, unknown>,
  options: {} as Record<string, unknown>,
  effects: [] as Array<() => void | (() => void)>,
  cancel: vi.fn(),
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const [state, setState] = actual.useState(initial);
      if (
        state &&
        typeof state === "object" &&
        "active" in state &&
        "revision" in state
      )
        return [{ active: model.focused, revision: 3 }, setState];
      if (
        state &&
        typeof state === "object" &&
        "confirmed" in state &&
        "sending" in state
      )
        return [{ ...state, denied: model.denied }, setState];
      return [state, setState];
    },
  };
});
vi.mock("../../platform/auth/session-provider", () => ({
  useAuthSession: () => ({
    status: "authenticated",
    user: {
      userId: 7,
      account: "snow",
      permissionKeys: ["ai:conversation:use"],
    },
  }),
}));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => 4,
  assertSessionEpoch: vi.fn(),
}));
vi.mock("../../platform/api/api-client", () => ({
  apiRequest: vi.fn(),
  apiStreamRequest: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    model.options = options;
    return model.query;
  },
  useQueryClient: () => ({
    cancelQueries: model.cancel,
    invalidateQueries: vi.fn(),
  }),
}));
vi.mock("expo", () => ({ uuid: { v4: () => "request-id" } }));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ conversationId: model.route }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    model.effects.push(callback);
  },
  Link: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("react-native", () => ({
  useColorScheme: () => "light",
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("main", null, children),
  KeyboardAvoidingView: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  TextInput: ({
    editable,
    accessibilityLabel,
  }: {
    editable: boolean;
    accessibilityLabel: string;
  }) =>
    createElement("textarea", {
      disabled: !editable,
      "aria-label": accessibilityLabel,
    }),
  Pressable: ({
    children,
    disabled,
  }: {
    children?: ReactNode;
    disabled?: boolean;
  }) => createElement("button", { disabled }, children),
  ActivityIndicator: () => createElement("span", null, "Loading"),
  Platform: { OS: "ios" },
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));
import Screen from "./conversation-screen";
const id = "e9b35d28-193f-46f6-bdf4-dd6c9194ad25";
const detail = {
  conversationId: id,
  status: "active",
  messages: [
    {
      messageId: "2",
      role: "assistant",
      status: "complete",
      content: "Protected history answer",
      createdAt: "2026-11-02T00:00:00Z",
      citations: [],
    },
  ],
};
beforeEach(() => {
  model.focused = true;
  model.denied = false;
  model.route = id;
  model.effects = [];
  model.options = {};
  model.cancel.mockReset().mockResolvedValue(undefined);
  model.query = {
    data: detail,
    isFetching: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
});
const html = () => renderToStaticMarkup(createElement(Screen));
describe("AI detail screen wiring with substituted native components/hooks", () => {
  it("binds query cache to account/epoch/conversation/focus and only focuses reads", () => {
    expect(html()).toContain(detail.messages[0]!.content);
    expect(model.options).toMatchObject({
      queryKey: ["ai-conversation", 7, 4, id, 3],
      enabled: true,
      retry: false,
      staleTime: 0,
    });
  });
  it("hides history and disables the query while blurred", () => {
    model.focused = false;
    expect(html()).not.toContain(detail.messages[0]!.content);
    expect(model.options.enabled).toBe(false);
  });
  it("cancels exactly the old account/epoch/conversation prefix on blur", () => {
    html();
    const cleanup = model.effects[0]!();
    expect(typeof cleanup).toBe("function");
    if (cleanup) cleanup();
    expect(model.cancel).toHaveBeenCalledExactlyOnceWith({
      queryKey: ["ai-conversation", 7, 4, id],
    });
  });
  it("hides cached history and disables composing during focus reload", () => {
    model.query.isFetching = true;
    const value = html();
    expect(value).not.toContain(detail.messages[0]!.content);
    expect(value).toMatch(/<textarea[^>]*disabled/);
  });
  it.each([401, 403, 404])(
    "hides cached content after history error %s",
    (status) => {
      model.query.isError = true;
      model.query.error = new ApiError("private", {
        status,
        code: null,
        traceId: null,
      });
      expect(html()).not.toContain(detail.messages[0]!.content);
      expect(html()).toContain("重新加载");
    },
  );
  it("hides cached history and disables composing after a send permission error", () => {
    model.denied = true;
    expect(html()).not.toContain(detail.messages[0]!.content);
    expect(html()).toMatch(/<textarea[^>]*disabled/);
  });
  it("keeps archived history readable while disabling composition", () => {
    model.query.data = { ...detail, status: "archived" };
    const value = html();
    expect(value).toContain(detail.messages[0]!.content);
    expect(value).toContain("此会话已归档");
    expect(value).toMatch(/<textarea[^>]*disabled/);
  });
  it.each([undefined, [id], "../settings"])(
    "does not mount a query for ambiguous route %j",
    (route) => {
      model.route = route;
      expect(html()).toContain("无效的会话地址");
      expect(model.options).toEqual({});
    },
  );
});
