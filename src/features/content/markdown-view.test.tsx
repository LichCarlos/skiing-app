import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { MarkdownManager } from "@tiptap/markdown";
import { composerEditorExtensions } from "../community/composer-editor-schema";
import { markdownImportIssue } from "./markdown-model";
import { MarkdownView } from "./markdown-view";
vi.mock("react-native", () => ({
  useColorScheme: () => "light",
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("section", null, children),
  Image: ({ source }: { source: { uri: string } }) =>
    createElement("img", { src: source.uri }),
  StyleSheet: { create: (styles: unknown) => styles },
  Linking: { openURL: vi.fn() },
}));
vi.mock("expo-router", () => ({
  Link: ({
    href,
    children,
  }: {
    href: { pathname: string; params: Record<string, number> };
    children?: ReactNode;
  }) => createElement("a", { "data-route": JSON.stringify(href) }, children),
}));
const fixture =
  "# 雪道笔记\n\n**安全** [万龙](resort:7) [知识](article:9)\n\n![雪道](asset:12)\n\n| 装备 | 用途 |\n| --- | --- |\n| 头盔 | 保护 |";
it("native rendering substitutes show readable tables, authorized images and Router destinations", () => {
  const html = renderToStaticMarkup(
    createElement(MarkdownView, {
      source: fixture,
      format: "markdown_v1",
      images: [{ assetId: "12", url: "https://assets.test/signed" }],
    }),
  );
  expect(html).toContain("保护");
  expect(html).toContain("https://assets.test/signed");
  expect(html).toContain("/resorts/[resortId]");
  expect(html).toContain("/knowledge/[articleId]");
  expect(html).not.toContain('src="asset:');
});
it("does not render raw HTML, unsafe links or remote Markdown images", () => {
  const html = renderToStaticMarkup(
    createElement(MarkdownView, {
      source:
        "<script>alert(1)</script>\n\n![x](https://internal.test/private) [bad](javascript:alert)",
      format: "markdown_v1",
    }),
  );
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("data-route");
});
it("does not reinterpret legacy headings", () => {
  const html = renderToStaticMarkup(
    createElement(MarkdownView, { source: "# literal", format: "plain_text" }),
  );
  expect(html).toContain("# literal");
});
it("Expo Web independent editor round trips the same supported protocol", () => {
  const manager = new MarkdownManager({
    extensions: composerEditorExtensions(),
  });
  const doc = manager.parse(fixture),
    source = manager.serialize(doc);
  expect(markdownImportIssue(source)).toBeNull();
  expect(manager.parse(source)).toEqual(doc);
  expect(source).toContain("asset:12");
});
