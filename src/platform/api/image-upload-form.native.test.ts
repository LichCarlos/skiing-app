import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ uris: [] as string[] }));
vi.mock("expo-file-system", () => ({
  File: class extends Blob {
    constructor(uri: string) {
      super([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
      fixture.uris.push(uri);
    }
  },
}));
import { createImageUploadForm } from "./image-upload-form.native";

describe("native SDK 58 image upload body", () => {
  it("converts a picker URI to a readable file rather than a URI descriptor", async () => {
    const uri = "file:///cache/picker/snow.png";
    const form = createImageUploadForm({
      uri,
      name: "snow.png",
      mimeType: "image/png",
      file: null,
    });
    const part = form.get("file") as File;
    expect(fixture.uris).toEqual([uri]);
    expect(part.name).toBe("snow.png");
    expect(part.type).toBe("image/png");
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
  });

  it("retains an existing Blob without reopening its preview URI", async () => {
    const count = fixture.uris.length;
    const form = createImageUploadForm({
      uri: "blob:preview",
      name: "snow.webp",
      mimeType: "image/webp",
      file: new Blob(["selected-bytes"], { type: "image/webp" }),
    });
    const part = form.get("file") as File;
    expect(fixture.uris).toHaveLength(count);
    expect(part.name).toBe("snow.webp");
    expect(part.type).toBe("image/webp");
    expect(await part.text()).toBe("selected-bytes");
  });
});
