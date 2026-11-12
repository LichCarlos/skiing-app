import { contentMetadataValid } from "../content/markdown-model";
import type { CommentPage, DynamicDetail, DynamicFeed } from "./community-api";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function id(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 2147483647
  );
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function time(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function author(value: unknown) {
  return (
    record(value) &&
    id(value.userId) &&
    typeof value.nickname === "string" &&
    (value.avatarUrl === null || typeof value.avatarUrl === "string")
  );
}
function card(value: unknown): value is Record<string, unknown> {
  return (
    record(value) &&
    id(value.dynamicId) &&
    author(value.author) &&
    typeof value.summary === "string" &&
    (value.coverUrl === null || typeof value.coverUrl === "string") &&
    count(value.imageCount) &&
    (value.resort === null ||
      (record(value.resort) &&
        id(value.resort.resortId) &&
        typeof value.resort.name === "string")) &&
    count(value.likeCount) &&
    count(value.commentCount) &&
    typeof value.likedByMe === "boolean" &&
    value.status === "published" &&
    time(value.createdAt)
  );
}
function unique(items: readonly Record<string, unknown>[], key: string) {
  return new Set(items.map((item) => item[key])).size === items.length;
}
export function validateDynamicFeed(
  value: unknown,
): asserts value is DynamicFeed {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 20 ||
    !value.items.every(card) ||
    !unique(value.items, "dynamicId") ||
    typeof value.hasNext !== "boolean" ||
    (value.nextCursor !== null &&
      (typeof value.nextCursor !== "string" ||
        !/^[A-Za-z0-9_-]{1,512}$/.test(value.nextCursor))) ||
    value.hasNext !== (value.nextCursor !== null)
  )
    throw new TypeError("Invalid community feed");
}
export function validateDynamicDetail(
  value: unknown,
  target: number,
): asserts value is DynamicDetail {
  if (
    !card(value) ||
    value.dynamicId !== target ||
    typeof value.content !== "string" ||
    value.content.length > 20000 ||
    !contentMetadataValid(value) ||
    !Array.isArray(value.imageUrls) ||
    !value.imageUrls.every((url) => typeof url === "string") ||
    value.imageUrls.length !== value.imageCount ||
    !time(value.updatedAt)
  )
    throw new TypeError("Invalid community detail");
}
export function validateCommentPage(
  value: unknown,
  page: number,
): asserts value is CommentPage {
  if (
    !record(value) ||
    value.page !== page ||
    value.pageSize !== 20 ||
    !count(value.total) ||
    typeof value.hasNext !== "boolean" ||
    !Array.isArray(value.items) ||
    value.items.length > 20 ||
    value.items.length > value.total ||
    !value.items.every(
      (item) =>
        record(item) &&
        id(item.commentId) &&
        author(item.author) &&
        typeof item.content === "string" &&
        time(item.createdAt) &&
        item.status === "visible",
    ) ||
    !unique(value.items, "commentId")
  )
    throw new TypeError("Invalid community comments");
}
export function validateLikeState(
  value: unknown,
  liked: boolean,
): asserts value is { liked: boolean; likeCount: number } {
  if (!record(value) || value.liked !== liked || !count(value.likeCount))
    throw new TypeError("Invalid community like state");
}
export function validateCommentMutation(value: unknown): asserts value is {
  commentId: number;
  createdAt: string;
  status: "visible";
} {
  if (
    !record(value) ||
    !id(value.commentId) ||
    !time(value.createdAt) ||
    value.status !== "visible"
  )
    throw new TypeError("Invalid community comment result");
}
