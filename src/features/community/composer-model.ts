import {
  markdownImportIssue,
  markdownImageIds,
} from "../content/markdown-model";
import type { OwnDynamicDetail } from "./community-api";

export class ComposerConflictError extends Error {
  constructor() {
    super("动态已在其他页面更新，请重新载入最新内容后编辑。");
  }
}

export const MAX_COMPOSER_IMAGE_BYTES = 10 * 1024 * 1024;
export const COMPOSER_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export type ComposerImage =
  | {
      kind: "new";
      uri: string;
      name: string;
      mimeType: string;
      size: number | null;
      file: Blob | null;
    }
  | { kind: "existing"; assetId: string; uri: string; name: string };
export interface ComposerDraft {
  contentFormat?: "plain_text" | "markdown_v1";
  customFields?: Record<string, unknown>;
  content: string;
  images: readonly ComposerImage[];
  resortId: number | null;
}
export function composerTarget(value: unknown): number | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value))
    throw new TypeError("动态编号无效");
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id > 2147483647)
    throw new TypeError("动态编号无效");
  return id;
}
export function assertComposerDraft(input: ComposerDraft) {
  if (input.contentFormat === "markdown_v1") {
    const issue = markdownImportIssue(input.content);
    if (issue) throw new TypeError(issue);
  }
  if (input.contentFormat === "markdown_v1") {
    const owned = new Set(
      input.images.flatMap((image) =>
        image.kind === "existing" ? [image.assetId] : [],
      ),
    );
    if (markdownImageIds(input.content).some((id) => !owned.has(id)))
      throw new TypeError("正文图片必须保留在图片列表中，请先上传并重新插入");
  }
  const length = Array.from(input.content.trim()).length;
  if (length < 1 || length > 10000) throw new TypeError("正文需要1至10000字符");
  if (
    input.resortId !== null &&
    (!Number.isInteger(input.resortId) ||
      input.resortId < 1 ||
      input.resortId > 2147483647)
  )
    throw new TypeError("关联雪场编号无效");
  if (
    new Set(input.images.map((image) => image.uri)).size !== input.images.length
  )
    throw new TypeError("图片不能重复");
  const existing = input.images.filter((image) => image.kind === "existing");
  if (new Set(existing.map((image) => image.assetId)).size !== existing.length)
    throw new TypeError("原图片不能重复");
  for (const image of input.images) {
    if (!image.uri.trim()) throw new TypeError("图片地址无效");
    if (image.kind === "existing") {
      if (
        !/^[1-9]\d{0,18}$/.test(image.assetId) ||
        BigInt(image.assetId) > 9223372036854775807n
      )
        throw new TypeError("原图片编号无效");
    } else if (
      !COMPOSER_IMAGE_TYPES.has(image.mimeType) ||
      !image.name.trim() ||
      (image.size !== null &&
        (!Number.isSafeInteger(image.size) ||
          image.size < 1 ||
          image.size > MAX_COMPOSER_IMAGE_BYTES)) ||
      (image.file &&
        (image.file.size < 1 || image.file.size > MAX_COMPOSER_IMAGE_BYTES))
    )
      throw new TypeError("图片仅支持JPEG、PNG、WebP，且每张最多10 MiB");
  }
}
/** Signed URLs may expire/change without a content edit. */
export function composerSnapshot(value: OwnDynamicDetail) {
  return JSON.stringify([
    value.dynamicId,
    value.author.userId,
    value.updatedAt,
    value.status,
    value.content,
    value.contentFormat ?? "plain_text",
    value.version ?? null,
    value.customFields ?? {},
    value.resort?.resortId ?? null,
    value.imageCount,
    value.images.map((image) => image.assetId),
  ]);
}
