import { describe, expect, it } from "vitest";
import {
  assertComposerDraft,
  composerSnapshot,
  composerTarget,
  type ComposerDraft,
  type ComposerImage,
} from "./composer-model";
import type { OwnDynamicDetail } from "./community-api";
const image: ComposerImage = {
  kind: "new",
  uri: "file:///snow.jpg",
  name: "snow.jpg",
  mimeType: "image/jpeg",
  size: 10,
  file: null,
};
const draft: ComposerDraft = {
  content: "滑雪",
  images: [image],
  resortId: null,
};
describe("composer input and snapshot", () => {
  it("accepts image collections beyond the old count limits", () => {
    const images: ComposerImage[] = Array.from({ length: 150 }, (_, i) => ({
      kind: "existing",
      assetId: String(i + 1),
      uri: `https://assets.test/${i + 1}.jpg`,
      name: `雪${i + 1}`,
    }));
    expect(() =>
      assertComposerDraft({
        ...draft,
        contentFormat: "markdown_v1",
        content: images
          .map((x) => `![雪](asset:${x.kind === "existing" ? x.assetId : ""})`)
          .join("\n"),
        images,
      }),
    ).not.toThrow();
  });
  it("distinguishes creation from strict int4 editing", () => {
    expect(composerTarget(undefined)).toBeNull();
    expect(composerTarget("2147483647")).toBe(2147483647);
  });
  it.each([null, [], ["1"], "", "0", "01", "-1", "1.5", "1e3", "2147483648"])(
    "rejects ambiguous edit target %j",
    (input) => expect(() => composerTarget(input)).toThrow(),
  );
  it("uses Unicode code points for the existing 10000 character content limit", () => {
    assertComposerDraft({ ...draft, content: "😀".repeat(10000) });
    expect(() =>
      assertComposerDraft({ ...draft, content: "😀".repeat(10001) }),
    ).toThrow();
  });
  it.each([
    { content: "  " },
    { resortId: 0 },
    { resortId: 2147483648 },
    { images: Array(10).fill(image) },
    { images: [image, image] },
    { images: [{ ...image, mimeType: "image/gif" }] },
    { images: [{ ...image, size: 0 }] },
    { images: [{ ...image, size: 10 * 1024 * 1024 + 1 }] },
    { images: [{ kind: "existing", uri: "x", assetId: "0", name: "x" }] },
  ])("rejects invalid draft before uploads %j", (change) =>
    expect(() =>
      assertComposerDraft({ ...draft, ...change } as ComposerDraft),
    ).toThrow(),
  );
  it("does not identify a changed signed URL as a content conflict", () => {
    const value = {
      dynamicId: 1,
      author: { userId: 7 },
      content: "snow",
      status: "published",
      updatedAt: "2026-11-02T00:00:00Z",
      resort: null,
      imageCount: 1,
      images: [{ assetId: "10", url: "https://a.test/old" }],
    } as OwnDynamicDetail;
    expect(composerSnapshot(value)).toBe(
      composerSnapshot({
        ...value,
        images: [{ assetId: "10", url: "https://a.test/new" }],
      }),
    );
    expect(composerSnapshot(value)).not.toBe(
      composerSnapshot({ ...value, content: "changed" }),
    );
    expect(composerSnapshot(value)).not.toBe(
      composerSnapshot({ ...value, images: [{ assetId: "11", url: "x" }] }),
    );
  });
});
