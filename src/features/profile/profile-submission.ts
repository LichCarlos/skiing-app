import { ApiError } from "../../platform/api/api-error";
import type { ProfilePatch, UserProfile } from "./profile-api";

export class ProfileUnconfirmedError extends Error {}
export class ProfileSessionEndedError extends Error {}

export function isAssetId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= 9_223_372_036_854_775_807n
  );
}

export function normalizedNickname(value: string): string {
  const nickname = value.trim();
  if (Array.from(nickname).length < 1 || Array.from(nickname).length > 50) {
    throw new Error("昵称需要为 1–50 个字");
  }
  return nickname;
}

export function validateAvatar(mimeType: string, size: number | null): void {
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new Error("仅支持 JPEG、PNG 或 WebP 图片");
  }
  if (
    size !== null &&
    (!Number.isFinite(size) ||
      !Number.isInteger(size) ||
      size <= 0 ||
      size > 10 * 1024 * 1024)
  ) {
    throw new Error("图片大小应在 10 MiB 以内且不能为空");
  }
}

/** Never remove an uploaded avatar after an unconfirmed PATCH: it may be referenced. */
export async function saveProfile<T>(
  input: {
    nickname: string;
    avatar: { kind: "keep" } | { kind: "clear" } | { kind: "new"; image: T };
  },
  ports: {
    isActive(): boolean;
    upload(image: T): Promise<{ assetId: string; status: string }>;
    patch(input: ProfilePatch): Promise<UserProfile>;
  },
): Promise<UserProfile> {
  const nickname = normalizedNickname(input.nickname);
  const assertActive = () => {
    if (!ports.isActive()) throw new ProfileSessionEndedError();
  };
  assertActive();
  const patch: ProfilePatch = { nickname };
  if (input.avatar.kind === "clear") patch.avatarAssetId = null;
  if (input.avatar.kind === "new") {
    const asset = await ports.upload(input.avatar.image);
    assertActive();
    if (asset.status !== "ready")
      throw new Error("头像未通过安全扫描，请重新选择图片");
    patch.avatarAssetId = asset.assetId;
  }
  assertActive();
  try {
    const result = await ports.patch(patch);
    assertActive();
    return result;
  } catch (error) {
    const definitive =
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 408;
    if (!definitive && ports.isActive()) {
      throw new ProfileUnconfirmedError(
        "保存结果尚未确认，请刷新资料核对后再编辑",
        { cause: error },
      );
    }
    throw error;
  }
}
