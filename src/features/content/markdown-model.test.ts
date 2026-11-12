import { describe, expect, it } from "vitest";
import {
  contentLink,
  contentMetadataValid,
  markdownImageIds,
  markdownImportIssue,
  parseMarkdownContent,
  plainMarkdown,
} from "./markdown-model";

describe("Independent Expo Markdown v1 protocol", () => {
  it("accepts 150 distinct images and metadata while retaining link validation", () => {
    const bodyAssets = Array.from({ length: 150 }, (_, i) => ({
      assetId: String(i + 1),
      url: `https://assets.test/${i + 1}.jpg`,
    }));
    const source = bodyAssets
      .map((x) => `![雪](asset:${x.assetId})`)
      .join("\n");
    expect(markdownImportIssue(source)).toBeNull();
    expect(markdownImageIds(source)).toHaveLength(150);
    expect(contentMetadataValid({ bodyAssets })).toBe(true);
    expect(
      markdownImportIssue("[来源](https://example.com) ".repeat(101)),
    ).not.toBeNull();
    expect(
      contentMetadataValid({ bodyAssets: [...bodyAssets, bodyAssets[0]] }),
    ).toBe(false);
  });
  it("preserves literal text during explicit format conversion", () => {
    const tree = parseMarkdownContent(plainMarkdown("# 雪道 **字面** <html>"));
    expect(tree.children?.[0]?.type).toBe("paragraph");
    expect(
      tree.children?.[0]?.children?.map((node) => node.value).join(""),
    ).toBe("# 雪道 **字面** <html>");
  });
  it("deduplicates image references but never extracts code as a binding", () => {
    expect(
      markdownImageIds(
        "![a](asset:12) ![b][img]\n\n[img]: asset:12\n\n`![x](asset:99)`",
      ),
    ).toEqual(["12"]);
  });
  it.each([
    "<img src=x>",
    "[x](javascript:alert)",
    "![x](file:///private)",
    "![x](https://remote.test/a.png)",
    "- [x] done",
    "[x](#missing)",
  ])("rejects unsafe/lossy input %s", (source) =>
    expect(markdownImportIssue(source)).not.toBeNull(),
  );
  it("supports tables, six heading levels and stable links", () => {
    expect(
      markdownImportIssue(
        "###### 小标题\n\n|a|b|\n|---|---|\n|1|2|\n\n[雪场](resort:1) [知识](article:2)",
      ),
    ).toBeNull();
    expect(contentLink("resort:2147483648")).toBeNull();
  });
  it("accepts old wire projections and rejects invalid new metadata", () => {
    expect(contentMetadataValid({})).toBe(true);
    expect(
      contentMetadataValid({
        contentFormat: "markdown_v1",
        version: 1,
        bodyAssets: [{ assetId: "12", url: "https://assets.test/signed" }],
      }),
    ).toBe(true);
    for (const value of [
      { contentFormat: "unknown" },
      { version: 0 },
      { bodyAssets: [{ assetId: "12", url: "javascript:alert" }] },
      { bodyAssets: [{ assetId: "0", url: "https://x.test" }] },
    ])
      expect(contentMetadataValid(value)).toBe(false);
  });
});
