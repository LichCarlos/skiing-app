import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../platform/api/api-client";
import {
  isAssetId,
  readProfileContext,
  updateProfile,
  uploadAvatar,
} from "./profile-api";
const expected = { userId: 1, account: "snow" };
const profile = {
  ...expected,
  nickname: "Snow",
  avatarAssetId: null,
  avatarUrl: null,
};
const request = () => ({ epoch: 12, signal: new AbortController().signal });
describe("profile transport identity and response boundaries", () => {
  beforeEach(() => vi.resetAllMocks());
  it("sends generated PATCH body with captured epoch and signal", async () => {
    vi.mocked(apiRequest).mockResolvedValue(profile);
    const context = request();
    expect(
      await updateProfile(
        { nickname: "Snow", avatarAssetId: null },
        context,
        expected,
      ),
    ).toEqual(profile);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/account/profile", {
      method: "PATCH",
      body: { nickname: "Snow", avatarAssetId: null },
      signal: context.signal,
      expectedSessionEpoch: 12,
    });
  });
  it("reads current identity/grants with no cache and does not invent an avatar AssetId", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...profile,
      permissionKeys: ["account:profile:update", "asset:upload"],
    });
    const context = request();
    expect(await readProfileContext(expected, context)).toEqual({
      ...expected,
      nickname: "Snow",
      avatarUrl: null,
      canEdit: true,
      canUpload: true,
    });
    expect(apiRequest).toHaveBeenCalledWith("/auth/me", {
      cache: "no-store",
      signal: context.signal,
      expectedSessionEpoch: 12,
    });
  });
  it("passes FormData through without altering content-type", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ assetId: "19", status: "ready" });
    const form = new FormData(),
      context = request();
    await uploadAvatar(form, context);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/assets", {
      method: "POST",
      body: form,
      signal: context.signal,
      expectedSessionEpoch: 12,
    });
  });
  it.each([
    { userId: 2 },
    { account: "different" },
    { nickname: "" },
    { nickname: "雪".repeat(51) },
    { avatarUrl: 123 },
    { permissionKeys: null },
  ])("rejects invalid current profile %#", async (change) => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...profile,
      permissionKeys: [],
      ...change,
    });
    await expect(readProfileContext(expected, request())).rejects.toThrow();
  });
  it.each([
    { userId: 2 },
    { account: "different" },
    { nickname: " " },
    { avatarAssetId: "01" },
    { avatarAssetId: "9223372036854775808" },
  ])("rejects untrusted PATCH acknowledgement %#", async (change) => {
    vi.mocked(apiRequest).mockResolvedValue({ ...profile, ...change });
    await expect(
      updateProfile({ nickname: "Snow" }, request(), expected),
    ).rejects.toThrow();
  });
  it.each([
    { assetId: "0", status: "ready" },
    { assetId: 19, status: "ready" },
    { assetId: "19", status: null },
  ])("rejects invalid upload acknowledgement %#", async (value) => {
    vi.mocked(apiRequest).mockResolvedValue(value);
    await expect(uploadAvatar(new FormData(), request())).rejects.toThrow();
  });
  it("does not send requests after abort, or accept responses after abort", async () => {
    const controller = new AbortController(),
      context = { epoch: 12, signal: controller.signal };
    controller.abort();
    await expect(
      updateProfile({ nickname: "Snow" }, context, expected),
    ).rejects.toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
    const late = new AbortController();
    vi.mocked(apiRequest).mockImplementation(async () => {
      late.abort();
      return profile;
    });
    await expect(
      updateProfile(
        { nickname: "Snow" },
        { epoch: 12, signal: late.signal },
        expected,
      ),
    ).rejects.toThrow();
  });
  it("validates canonical positive int64 AssetIds", () => {
    for (const value of ["1", "9223372036854775807"])
      expect(isAssetId(value)).toBe(true);
    for (const value of [
      null,
      1,
      "0",
      "-1",
      "01",
      "1.1",
      "1e2",
      "9223372036854775808",
    ])
      expect(isAssetId(value)).toBe(false);
  });
});
