import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

export interface ContentNode {
  type: string;
  value?: string;
  url?: string;
  identifier?: string;
  alt?: string;
  depth?: number;
  ordered?: boolean;
  start?: number;
  checked?: boolean | null;
  children?: ContentNode[];
}
const parser = unified().use(remarkParse).use(remarkGfm);
export function contentLink(
  value: string,
): { type: "article" | "resort"; id: number } | null {
  const match = /^(article|resort):([1-9]\d{0,9})$/.exec(value);
  if (!match || Number(match[2]) > 2147483647) return null;
  return { type: match[1] as "article" | "resort", id: Number(match[2]) };
}
export function safeExternalContentLink(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 32 || code === 127 || code === 92) return false;
  }
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function validContentAsset(value: string): boolean {
  return (
    /^asset:[1-9]\d{0,18}$/.test(value) &&
    BigInt(value.slice(6)) <= 9223372036854775807n
  );
}
export function parseMarkdownContent(source: string): ContentNode {
  if (source.length > 100000) throw new Error("正文过长");
  const root = parser.parse(source) as ContentNode;
  let count = 0;
  const walk = (node: ContentNode, depth: number) => {
    if (depth > 32 || ++count > 10000) throw new Error("正文结构过于复杂");
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  walk(root, 0);
  return root;
}
export function markdownImportIssue(source: string): string | null {
  let root: ContentNode;
  try {
    root = parseMarkdownContent(source);
  } catch (error) {
    return error instanceof Error ? error.message : "正文无法解析";
  }
  const supported = new Set([
    "root",
    "paragraph",
    "heading",
    "text",
    "strong",
    "emphasis",
    "delete",
    "list",
    "listItem",
    "blockquote",
    "thematicBreak",
    "break",
    "code",
    "inlineCode",
    "link",
    "image",
    "definition",
    "linkReference",
    "imageReference",
    "table",
    "tableRow",
    "tableCell",
  ]);
  const definitions = new Map<string, string>();
  const all: ContentNode[] = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    all.push(node);
    if (node.type === "definition")
      definitions.set(node.identifier!, node.url!);
    stack.push(...(node.children ?? []));
  }
  let linkCount = 0;
  for (const node of all) {
    if (!supported.has(node.type) || node.checked != null)
      return "暂不支持 HTML、嵌入内容、脚注或任务列表";
    const url = node.url ?? definitions.get(node.identifier ?? "") ?? "";
    if (["link", "linkReference"].includes(node.type) && ++linkCount > 100)
      return "链接最多100次引用";
    if (
      ["image", "imageReference"].includes(node.type) &&
      !validContentAsset(url)
    )
      return "图片必须先上传，不能引用远程图片或本地文件";
    if (
      ["link", "linkReference"].includes(node.type) &&
      !contentLink(url) &&
      !safeExternalContentLink(url)
    )
      return "存在不安全或不支持的链接";
  }
  return null;
}
export function plainMarkdown(value: string): string {
  return value
    .replace(/([\\`*_{}[\]()#+\-.!>|~])/g, "\\$1")
    .replace(/\r?\n/g, "  \n");
}

/** Includes reference-style images, but not code examples or ordinary text. */
export function markdownImageIds(source: string): string[] {
  const root = parseMarkdownContent(source),
    nodes: ContentNode[] = [],
    stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    nodes.push(node);
    stack.push(...(node.children ?? []));
  }
  const definitions = new Map(
    nodes
      .filter((n) => n.type === "definition")
      .map((n) => [n.identifier, n.url]),
  );
  return [
    ...new Set(
      nodes
        .filter((n) => n.type === "image" || n.type === "imageReference")
        .map((n) => n.url ?? definitions.get(n.identifier) ?? "")
        .filter(validContentAsset)
        .map((url) => url.slice(6)),
    ),
  ];
}
export function contentMetadataValid(value: Record<string, unknown>): boolean {
  if (
    value.contentFormat !== undefined &&
    value.contentFormat !== "plain_text" &&
    value.contentFormat !== "markdown_v1"
  )
    return false;
  if (
    value.version !== undefined &&
    (!Number.isInteger(value.version) ||
      Number(value.version) < 1 ||
      Number(value.version) > 2147483647)
  )
    return false;
  if (value.bodyAssets === undefined) return true;
  if (!Array.isArray(value.bodyAssets)) return false;
  const ids = new Set<string>();
  return value.bodyAssets.every((asset: unknown) => {
    if (
      !asset ||
      typeof asset !== "object" ||
      !("assetId" in asset) ||
      !("url" in asset) ||
      typeof asset.assetId !== "string" ||
      !validContentAsset(`asset:${asset.assetId}`) ||
      typeof asset.url !== "string" ||
      !safeExternalContentLink(asset.url) ||
      ids.has(asset.assetId)
    )
      return false;
    ids.add(asset.assetId);
    return true;
  });
}
