import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../platform/api/api-error";
import type { UserProfile } from "./profile-api";
import {
  normalizedNickname,
  ProfileSessionEndedError,
  ProfileUnconfirmedError,
  saveProfile,
  validateAvatar,
} from "./profile-submission";

function fixture() {
  let active = true;
  const ports = {
    isActive: () => active,
    upload: vi.fn(async (_image: string) => ({
      assetId: "19",
      status: "ready",
    })),
    patch: vi.fn(async (_patch: object): Promise<UserProfile> => ({
      userId: 1,
      account: "snow",
      nickname: "Snow",
      avatarAssetId: "19",
      avatarUrl: "signed",
    })),
  };
  return {
    ports,
    leave: () => {
      active = false;
    },
  };
}
describe("Profile submission lifecycle", () => {
  it("omits an unchanged avatar and trims the nickname", async () => {
    const { ports } = fixture();
    await saveProfile({ nickname: " Snow ", avatar: { kind: "keep" } }, ports);
    expect(ports.patch).toHaveBeenCalledWith({ nickname: "Snow" });
    expect(ports.upload).not.toHaveBeenCalled();
  });
  it("clears with explicit null without uploading", async () => {
    const { ports } = fixture();
    await saveProfile({ nickname: "Snow", avatar: { kind: "clear" } }, ports);
    expect(ports.patch).toHaveBeenCalledWith({
      nickname: "Snow",
      avatarAssetId: null,
    });
    expect(ports.upload).not.toHaveBeenCalled();
  });
  it("uses only a scanned server asset ID and never sends a local URL", async () => {
    const { ports } = fixture();
    await saveProfile(
      { nickname: "Snow", avatar: { kind: "new", image: "local-file" } },
      ports,
    );
    expect(ports.patch).toHaveBeenCalledWith({
      nickname: "Snow",
      avatarAssetId: "19",
    });
  });
  it.each(["pending_scan", "rejected", "deleted"])(
    "stops before PATCH for %s uploads",
    async (status) => {
      const { ports } = fixture();
      ports.upload.mockResolvedValue({ assetId: "19", status });
      await expect(
        saveProfile(
          { nickname: "Snow", avatar: { kind: "new", image: "file" } },
          ports,
        ),
      ).rejects.toThrow();
      expect(ports.patch).not.toHaveBeenCalled();
    },
  );
  it("stops before writes when the composing account ends", async () => {
    const { ports, leave } = fixture();
    leave();
    await expect(
      saveProfile(
        { nickname: "Snow", avatar: { kind: "new", image: "file" } },
        ports,
      ),
    ).rejects.toBeInstanceOf(ProfileSessionEndedError);
    expect(ports.upload).not.toHaveBeenCalled();
    expect(ports.patch).not.toHaveBeenCalled();
  });
  it("does not PATCH after an account switch during upload", async () => {
    const { ports, leave } = fixture();
    ports.upload.mockImplementation(async () => {
      leave();
      return { assetId: "19", status: "ready" };
    });
    await expect(
      saveProfile(
        { nickname: "Snow", avatar: { kind: "new", image: "file" } },
        ports,
      ),
    ).rejects.toBeInstanceOf(ProfileSessionEndedError);
    expect(ports.patch).not.toHaveBeenCalled();
  });
  it.each([0, 408, 500, 503])(
    "requires reconciliation for an unconfirmed PATCH (%s) without automatic retry",
    async (status) => {
      const { ports } = fixture();
      ports.patch.mockRejectedValue(
        new ApiError("failed", { status, code: null, traceId: null }),
      );
      await expect(
        saveProfile(
          { nickname: "Snow", avatar: { kind: "new", image: "file" } },
          ports,
        ),
      ).rejects.toBeInstanceOf(ProfileUnconfirmedError);
      expect(ports.patch).toHaveBeenCalledOnce();
      expect(ports.upload).toHaveBeenCalledOnce();
    },
  );
  it.each([400, 401, 403, 409, 422])(
    "preserves definitive rejection %s",
    async (status) => {
      const { ports } = fixture();
      const error = new ApiError("failed", {
        status,
        code: null,
        traceId: null,
      });
      ports.patch.mockRejectedValue(error);
      await expect(
        saveProfile({ nickname: "Snow", avatar: { kind: "keep" } }, ports),
      ).rejects.toBe(error);
    },
  );
  it("does not apply a successful but late response to an ended account", async () => {
    const { ports, leave } = fixture();
    ports.patch.mockImplementation(async () => {
      leave();
      return {
        userId: 1,
        account: "snow",
        nickname: "Snow",
        avatarAssetId: null,
        avatarUrl: "",
      };
    });
    await expect(
      saveProfile({ nickname: "Snow", avatar: { kind: "keep" } }, ports),
    ).rejects.toBeInstanceOf(ProfileSessionEndedError);
  });
  it("validates Unicode nicknames and image format/size before upload", () => {
    expect(normalizedNickname("  🏂雪  ")).toBe("🏂雪");
    expect(normalizedNickname("🏂".repeat(50))).toHaveLength(100);
    for (const name of ["", " ", "雪".repeat(51)])
      expect(() => normalizedNickname(name)).toThrow();
    for (const type of ["image/jpeg", "image/png", "image/webp"])
      expect(() => validateAvatar(type, 10 * 1024 * 1024)).not.toThrow();
    expect(() => validateAvatar("image/heic", 1)).toThrow();
    expect(() => validateAvatar("image/png", 10 * 1024 * 1024 + 1)).toThrow();
    expect(() => validateAvatar("image/png", 0)).toThrow();
    for (const size of [NaN, Infinity, -Infinity, 1.5])
      expect(() => validateAvatar("image/png", size)).toThrow();
  });
});
