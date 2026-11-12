import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteConfig } from "./site-config-api";
const data: SiteConfig = {
  siteName: "雪客",
  tagline: "滑雪平台",
  about: "平台介绍正文",
  contactEmail: "contact@example.test",
  privacyPolicy: "隐私正文",
  termsOfService: "协议正文",
  revision: "a".repeat(64),
};
const model = vi.hoisted(() => ({
  query: {
    data: null as SiteConfig | null,
    isFetching: false,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  retry: null as null | (() => void),
}));
vi.mock("./use-site-config", () => ({ useSiteConfig: () => model.query }));
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  Link: ({ children, href }: { children?: ReactNode; href: string }) =>
    createElement("a", { href }, children),
}));
vi.mock("react-native", () => ({
  useColorScheme: () => "light",
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("main", null, children),
  ActivityIndicator: (props: { accessibilityLabel?: string }) =>
    createElement("span", null, props.accessibilityLabel),
  Pressable: ({
    children,
    onPress,
  }: {
    children?: ReactNode;
    onPress: () => void;
  }) => {
    model.retry = onPress;
    return createElement("button", null, children);
  },
  StyleSheet: { create: (value: unknown) => value },
}));
import { PolicyScreen, SiteInfoLinks } from "./policy-screen";
beforeEach(() => {
  vi.clearAllMocks();
  model.retry = null;
  model.query = {
    data,
    isFetching: false,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
});
describe("public policy pages (native UI and focus query mocked)", () => {
  it.each([
    ["about", "平台介绍正文"],
    ["privacyPolicy", "隐私正文"],
    ["termsOfService", "协议正文"],
  ] as const)("renders the %s public field", (kind, content) => {
    const html = renderToStaticMarkup(
      createElement(PolicyScreen, { kind, title: "标题" }),
    );
    expect(html).toContain(content);
    expect(html).toContain("雪客");
    expect(html.includes("contact@example.test")).toBe(kind === "about");
  });
  it.each(["isFetching", "isPending"] as const)(
    "hides previous policy content during %s",
    (state) => {
      model.query[state] = true;
      const html = renderToStaticMarkup(
        createElement(PolicyScreen, {
          kind: "privacyPolicy",
          title: "隐私政策",
        }),
      );
      expect(html).toContain("正在加载平台信息");
      expect(html).not.toContain("隐私正文");
    },
  );
  it("shows a retry after failure and does not display old success text", () => {
    model.query.isError = true;
    const html = renderToStaticMarkup(
      createElement(PolicyScreen, { kind: "privacyPolicy", title: "隐私政策" }),
    );
    expect(html).toContain("内容暂时无法加载");
    expect(html).not.toContain("隐私正文");
    model.retry!();
    expect(model.query.refetch).toHaveBeenCalledTimes(1);
  });
  it("shows missing policy text and treats markup as literal text", () => {
    model.query.data = { ...data, privacyPolicy: null };
    expect(
      renderToStaticMarkup(
        createElement(PolicyScreen, {
          kind: "privacyPolicy",
          title: "隐私政策",
        }),
      ),
    ).toContain("尚未发布正式内容");
    model.query.data = {
      ...data,
      privacyPolicy: "<script>literal</script>\n第二段",
    };
    const html = renderToStaticMarkup(
      createElement(PolicyScreen, { kind: "privacyPolicy", title: "隐私政策" }),
    );
    expect(html).toContain("&lt;script&gt;literal&lt;/script&gt;");
    expect(html).toContain("第二段");
    expect(html).not.toContain("<script>");
  });
  it("provides all three public route links", () => {
    const html = renderToStaticMarkup(createElement(SiteInfoLinks));
    for (const path of ["/about", "/privacy", "/terms"])
      expect(html).toContain(`href="${path}"`);
  });
});
