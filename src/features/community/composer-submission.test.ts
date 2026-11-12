import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../platform/api/api-error";
import {
  ComposerSessionEndedError,
  PublicationUnconfirmedError,
  publishWithImages,
  saveEditedDynamicWithImages,
} from "./composer-submission";

const input = {
  content: "  雪道体验  ",
  resortId: 7,
  images: ["second.jpg", "first.jpg"],
};
function fixture() {
  let active = true;
  const ports = {
    isActive: () => active,
    upload: vi.fn(
      async (
        _image: string,
        index: number,
      ): Promise<{ assetId: string; status: "ready" | "pending_scan" }> => ({
        assetId: String(index + 10),
        status: "ready",
      }),
    ),
    publish: vi.fn(async () => ({ dynamicId: 3, status: "pending" as const })),
    remove: vi.fn(async (_id: string) => undefined),
  };
  return {
    ports,
    leave: () => {
      active = false;
    },
  };
}
function httpError(status: number) {
  return new ApiError("request failed", {
    status,
    code: status,
    traceId: "test-trace",
  });
}

describe("dynamic publication workflow", () => {
  it("preserves explicit photo order and uses the server-returned IDs and selected resort", async () => {
    const { ports } = fixture();
    await expect(publishWithImages(input, ports)).resolves.toEqual({
      dynamicId: 3,
      status: "pending",
    });
    expect(ports.upload.mock.calls).toEqual([
      ["second.jpg", 0],
      ["first.jpg", 1],
    ]);
    expect(ports.publish).toHaveBeenCalledExactlyOnceWith({
      content: "雪道体验",
      imageAssetIds: ["10", "11"],
      resortId: 7,
    });
    expect(ports.remove).not.toHaveBeenCalled();
  });

  it("allows text-only publications without inventing a resort association", async () => {
    const { ports } = fixture();
    await publishWithImages({ content: "文本", images: [] }, ports);
    expect(ports.upload).not.toHaveBeenCalled();
    expect(ports.publish).toHaveBeenCalledWith({
      content: "文本",
      imageAssetIds: [],
    });
  });

  it("does not publish pending-scan assets and attempts cleanup", async () => {
    const { ports } = fixture();
    ports.upload.mockImplementation(async () => ({
      assetId: "12",
      status: "pending_scan",
    }));
    await expect(publishWithImages(input, ports)).rejects.toThrow("scanning");
    expect(ports.publish).not.toHaveBeenCalled();
    expect(ports.remove).toHaveBeenCalledExactlyOnceWith("12");
  });

  it("cleans only completed uploads after an intermediate upload fails, preserving the original error", async () => {
    const { ports } = fixture();
    ports.upload.mockRejectedValueOnce(new Error("upload offline"));
    await expect(publishWithImages(input, ports)).rejects.toThrow(
      "upload offline",
    );
    expect(ports.publish).not.toHaveBeenCalled();
    expect(ports.remove).not.toHaveBeenCalled();
    ports.upload
      .mockResolvedValueOnce({ assetId: "20", status: "ready" })
      .mockRejectedValueOnce(new Error("upload offline"));
    ports.remove.mockRejectedValue(new Error("cleanup offline"));
    await expect(publishWithImages(input, ports)).rejects.toThrow(
      "upload offline",
    );
    expect(ports.remove).toHaveBeenCalledExactlyOnceWith("20");
  });

  it("cleans unassociated assets after a definite validation rejection", async () => {
    const { ports } = fixture();
    ports.publish.mockRejectedValue(httpError(400));
    await expect(publishWithImages(input, ports)).rejects.toMatchObject({
      status: 400,
    });
    expect(ports.remove.mock.calls).toEqual([["10"], ["11"]]);
  });

  it.each([0, 408, 500, 502, 201])(
    "keeps assets and reports an unknown result after publication error %s",
    async (status) => {
      const { ports } = fixture();
      ports.publish.mockRejectedValue(httpError(status));
      await expect(publishWithImages(input, ports)).rejects.toBeInstanceOf(
        PublicationUnconfirmedError,
      );
      expect(ports.publish).toHaveBeenCalledOnce();
      expect(ports.remove).not.toHaveBeenCalled();
    },
  );

  it("never begins uploads or publication after the author leaves", async () => {
    const { ports, leave } = fixture();
    leave();
    await expect(publishWithImages(input, ports)).rejects.toBeInstanceOf(
      ComposerSessionEndedError,
    );
    expect(ports.upload).not.toHaveBeenCalled();
    expect(ports.publish).not.toHaveBeenCalled();
  });

  it("stops between uploads after an account switch and never cleans assets using the next account", async () => {
    const { ports, leave } = fixture();
    ports.upload.mockImplementationOnce(async () => {
      leave();
      return { assetId: "10", status: "ready" };
    });
    await expect(publishWithImages(input, ports)).rejects.toBeInstanceOf(
      ComposerSessionEndedError,
    );
    expect(ports.upload).toHaveBeenCalledOnce();
    expect(ports.publish).not.toHaveBeenCalled();
    expect(ports.remove).not.toHaveBeenCalled();
  });

  it("does not treat a late successful response as the new account's publication", async () => {
    const { ports, leave } = fixture();
    ports.publish.mockImplementationOnce(async () => {
      leave();
      return { dynamicId: 3, status: "pending" };
    });
    await expect(publishWithImages(input, ports)).rejects.toBeInstanceOf(
      ComposerSessionEndedError,
    );
    expect(ports.publish).toHaveBeenCalledOnce();
    expect(ports.remove).not.toHaveBeenCalled();
  });
});

describe("dynamic image editing", () => {
  const images = [
    { kind: "existing", assetId: "41" },
    { kind: "new", assetId: "" },
    { kind: "existing", assetId: "40" },
  ];
  function editFixture() {
    return {
      isActive: () => true,
      existingAssetId: (image: (typeof images)[number]) =>
        image.kind === "existing" ? image.assetId : undefined,
      upload: vi.fn(async () => ({ assetId: "42", status: "ready" as const })),
      publish: vi.fn(async (_input: unknown) => ({
        dynamicId: 3,
        status: "pending" as const,
      })),
      remove: vi.fn(async (_id: string) => undefined),
    };
  }
  it("uploads only new images, preserves mixed order and explicitly unlinks the resort", async () => {
    const ports = editFixture();
    await saveEditedDynamicWithImages(
      { content: " 编辑 ", resortId: null, images },
      ports,
    );
    expect(ports.upload).toHaveBeenCalledExactlyOnceWith(images[1], 1);
    expect(ports.publish).toHaveBeenCalledWith({
      content: "编辑",
      resortId: null,
      imageAssetIds: ["41", "42", "40"],
    });
    expect(ports.remove).not.toHaveBeenCalled();
  });
  it("saves removal of every image without deleting the original Asset records", async () => {
    const ports = editFixture();
    await saveEditedDynamicWithImages(
      { content: "文本", resortId: 7, images: [] },
      ports,
    );
    expect(ports.publish).toHaveBeenCalledWith({
      content: "文本",
      resortId: 7,
      imageAssetIds: [],
    });
    expect(ports.upload).not.toHaveBeenCalled();
    expect(ports.remove).not.toHaveBeenCalled();
  });
  it("compensates only newly uploaded assets after a definite edit rejection", async () => {
    const ports = editFixture();
    ports.publish.mockRejectedValue(httpError(400));
    await expect(
      saveEditedDynamicWithImages(
        { content: "编辑", resortId: null, images },
        ports,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(ports.remove).toHaveBeenCalledExactlyOnceWith("42");
  });
  it("keeps both old and new assets when the edit outcome is unknown", async () => {
    const ports = editFixture();
    ports.publish.mockRejectedValue(httpError(500));
    await expect(
      saveEditedDynamicWithImages(
        { content: "编辑", resortId: null, images },
        ports,
      ),
    ).rejects.toBeInstanceOf(PublicationUnconfirmedError);
    expect(ports.remove).not.toHaveBeenCalled();
  });
});
