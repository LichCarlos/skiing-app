import { describe, expect, it } from "vitest";
import { createImageUploadForm } from "./image-upload-form";

describe("browser image upload body", () => {
  it("preserves the selected file bytes, type and multipart filename", async () => {
    const file = new Blob([new Uint8Array([137, 80, 78, 71])], {
      type: "image/png",
    });
    const form = createImageUploadForm({
      uri: "blob:preview-only",
      name: "snow.png",
      mimeType: "image/png",
      file,
    });
    const part = form.get("file") as File;
    expect([...form.keys()]).toEqual(["file"]);
    expect(part.name).toBe("snow.png");
    expect(part.type).toBe("image/png");
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
  });

  it("refuses a preview URI without a browser file", () => {
    expect(() =>
      createImageUploadForm({
        uri: "blob:expired",
        name: "snow.png",
        mimeType: "image/png",
        file: null,
      }),
    ).toThrow("请重新选择");
  });
});
