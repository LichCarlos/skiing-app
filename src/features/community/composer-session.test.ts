import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ epoch: 4 }));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => auth.epoch,
  assertSessionEpoch: (epoch: number) => {
    if (epoch !== auth.epoch) throw new DOMException("changed", "AbortError");
  },
}));
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../platform/api/api-client";
import {
  createComposerSession,
  ComposerConflictError,
  validateComposerDetail,
} from "./composer-session";
import type { OwnDynamicDetail } from "./community-api";
const date = "2026-11-02T00:00:00Z";
const own = {
  dynamicId: 11,
  author: { userId: 7 },
  content: "snow",
  status: "published",
  updatedAt: date,
  imageCount: 0,
  images: [],
  resort: null,
} as unknown as OwnDynamicDetail;
const me = {
  userId: 7,
  permissionKeys: [
    "community:dynamic:create",
    "community:dynamic:update-own",
    "community:dynamic:read-own",
    "asset:upload",
    "asset:delete-own",
  ],
};
const body = { content: "edited", imageAssetIds: [], resortId: null };
const signal = () => new AbortController().signal;
const request = vi.mocked(apiRequest);
beforeEach(() => {
  auth.epoch = 4;
  request.mockReset();
});
describe("composer captured credentials and submission", () => {
  it("binds protected edit pre/post reads to one epoch", async () => {
    request.mockImplementation(async (path) =>
      path === "/auth/me" ? me : own,
    );
    expect(await createComposerSession(7, 11).read(signal())).toEqual(own);
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/me/dynamics/11",
      "/auth/me",
    ]);
    for (const [, options] of request.mock.calls)
      expect(options).toMatchObject({
        expectedSessionEpoch: 4,
        cache: "no-store",
      });
  });
  it("denies another owner and malformed protected detail", () => {
    expect(() => validateComposerDetail(own, 11, 8)).toThrow();
    expect(() =>
      validateComposerDetail(
        { ...own, images: [{ assetId: "-1", url: "x" }] },
        11,
        7,
      ),
    ).toThrow();
  });
  it("does not issue a request for an old epoch", async () => {
    const session = createComposerSession(7, null);
    auth.epoch++;
    await expect(
      session.save(body, null, signal(), vi.fn()),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });
  it.each(["community:dynamic:update-own", "community:dynamic:read-own"])(
    "requires %s before reading or writing edit data",
    async (permission) => {
      request.mockResolvedValue({
        ...me,
        permissionKeys: me.permissionKeys.filter((key) => key !== permission),
      });
      await expect(
        createComposerSession(7, 11).read(signal()),
      ).rejects.toMatchObject({ status: 403 });
      expect(request).toHaveBeenCalledOnce();
    },
  );
  it("does not PATCH a form based on an out-of-date snapshot", async () => {
    request.mockImplementation(async (path) =>
      path === "/auth/me" ? me : { ...own, content: "external edit" },
    );
    const attempt = vi.fn();
    await expect(
      createComposerSession(7, 11).save(body, own, signal(), attempt),
    ).rejects.toBeInstanceOf(ComposerConflictError);
    expect(attempt).not.toHaveBeenCalled();
    expect(
      request.mock.calls.some(([, opts]) => opts?.method === "PATCH"),
    ).toBe(false);
  });
  it("sends explicit unlink and image replacement only after preflight", async () => {
    const attempt = vi.fn();
    request.mockImplementation(async (path, opts) =>
      path === "/auth/me"
        ? me
        : opts?.method === "PATCH"
          ? (expect(attempt).toHaveBeenCalledOnce(),
            { dynamicId: 11, status: "pending" })
          : own,
    );
    expect(
      await createComposerSession(7, 11).save(body, own, signal(), attempt),
    ).toEqual({ dynamicId: 11, status: "pending" });
    expect(request.mock.calls.at(-1)).toMatchObject([
      "/dynamics/11",
      { method: "PATCH", body, expectedSessionEpoch: 4 },
    ]);
  });
  it("does not return a malformed successful publication as confirmed", async () => {
    request
      .mockResolvedValueOnce(me)
      .mockResolvedValueOnce({ dynamicId: 0, status: "pending" });
    const attempt = vi.fn();
    await expect(
      createComposerSession(7, null).save(
        { ...body, resortId: undefined },
        null,
        signal(),
        attempt,
      ),
    ).rejects.toThrow("结果");
    expect(attempt).toHaveBeenCalledOnce();
  });
  it("uploads a selected Blob as multipart using the captured session", async () => {
    request
      .mockResolvedValueOnce(me)
      .mockResolvedValueOnce({ assetId: "10", status: "ready" });
    await createComposerSession(7, null).upload(
      {
        kind: "new",
        uri: "blob:x",
        name: "x.png",
        mimeType: "image/png",
        size: 1,
        file: new Blob(["x"], { type: "image/png" }),
      },
      signal(),
    );
    expect(request.mock.calls[1]).toMatchObject([
      "/assets",
      { method: "POST", expectedSessionEpoch: 4, body: expect.any(FormData) },
    ]);
  });
  it("does not clean assets with missing delete permission", async () => {
    request.mockResolvedValue({
      ...me,
      permissionKeys: ["community:dynamic:create"],
    });
    await expect(
      createComposerSession(7, null).remove("10", signal()),
    ).rejects.toMatchObject({ status: 403 });
    expect(request).toHaveBeenCalledOnce();
  });
});
