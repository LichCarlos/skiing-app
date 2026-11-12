import { describe, expect, it } from "vitest";
import {
  validateCommentPage,
  validateDynamicDetail,
  validateDynamicFeed,
  validateLikeState,
} from "./community-validation";
const date = "2026-11-02T00:00:00Z";
const card = {
  dynamicId: 11,
  author: { userId: 7, nickname: "snow", avatarUrl: null },
  summary: "雪",
  coverUrl: null,
  imageCount: 0,
  resort: null,
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  status: "published",
  createdAt: date,
};
const detail = { ...card, content: "雪", imageUrls: [], updatedAt: date };
const comment = {
  commentId: 21,
  author: card.author,
  content: "雪",
  status: "visible",
  createdAt: date,
};
describe("community public response validation", () => {
  it("accepts large image feeds and details", () => {
    const bodyAssets = Array.from({ length: 150 }, (_, i) => ({
      assetId: String(i + 1),
      url: `https://assets.test/${i + 1}.jpg`,
    }));
    validateDynamicFeed({
      items: [{ ...card, imageCount: 150 }],
      nextCursor: null,
      hasNext: false,
    });
    validateDynamicDetail(
      {
        ...detail,
        imageCount: 150,
        bodyAssets,
        imageUrls: bodyAssets.map((x) => x.url),
      },
      11,
    );
  });
  it("accepts public empty feeds, detail and comments", () => {
    validateDynamicFeed({ items: [], nextCursor: null, hasNext: false });
    validateDynamicDetail(detail, 11);
    validateCommentPage(
      { items: [comment], page: 1, pageSize: 20, total: 1, hasNext: false },
      1,
    );
  });
  it.each([
    { status: "hidden" },
    { createdAt: "bad" },
    { dynamicId: 2147483648 },
    { author: null },
    { imageCount: -1 },
    { resort: { resortId: -1, name: "x" } },
    { likeCount: -1 },
  ])("rejects unsafe card %j", (change) => {
    expect(() =>
      validateDynamicFeed({
        items: [{ ...card, ...change }],
        hasNext: false,
        nextCursor: null,
      }),
    ).toThrow();
  });
  it.each([
    { hasNext: true, nextCursor: null },
    { hasNext: false, nextCursor: "abc" },
    { hasNext: true, nextCursor: "bad&cursor" },
  ])("rejects inconsistent cursor %j", (change) => {
    expect(() => validateDynamicFeed({ items: [card], ...change })).toThrow();
  });
  it("rejects duplicate feed rows and mismatched detail target or images", () => {
    expect(() =>
      validateDynamicFeed({
        items: [card, card],
        nextCursor: null,
        hasNext: false,
      }),
    ).toThrow();
    expect(() => validateDynamicDetail(detail, 12)).toThrow();
    expect(() =>
      validateDynamicDetail(
        { ...detail, imageUrls: ["https://example.test/x"] },
        11,
      ),
    ).toThrow();
  });
  it.each([
    { items: [comment, comment], total: 2 },
    { items: [{ ...comment, status: "hidden" }] },
    { page: 2 },
    { total: 0 },
  ])("rejects invalid comment page %j", (change) => {
    expect(() =>
      validateCommentPage(
        {
          items: [comment],
          page: 1,
          pageSize: 20,
          total: 1,
          hasNext: false,
          ...change,
        },
        1,
      ),
    ).toThrow();
  });
  it.each([
    { liked: false, likeCount: 1 },
    { liked: true, likeCount: -1 },
  ])(
    "does not accept a like command with an unconfirmed result %j",
    (value) => {
      expect(() => validateLikeState(value, true)).toThrow();
    },
  );
});
