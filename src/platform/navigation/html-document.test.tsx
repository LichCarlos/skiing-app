import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("expo-router/html", () => ({
  ScrollViewStyleReset: () => null,
  useServerDocumentContext: () => ({
    htmlAttributes: { "data-document": "ssr" },
    bodyAttributes: { "data-hydration": "ready" },
    headNodes: createElement(
      "style",
      { id: "native-styles" },
      "body{margin:0}",
    ),
    bodyNodes: createElement("script", { src: "/app-entry.js" }),
  }),
}));
import Root from "../../../app/+html";
describe("Expo SSR document assets", () => {
  it("preserves server styles, hydration script, attributes and route content", () => {
    const html = renderToStaticMarkup(
      createElement(Root, { children: "页面内容" }),
    );
    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain('id="native-styles"');
    expect(html).toContain('src="/app-entry.js"');
    expect(html).toContain('data-document="ssr"');
    expect(html).toContain('data-hydration="ready"');
    expect(html).toContain("页面内容");
  });
});
