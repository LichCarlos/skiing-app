import { apiRequest } from "../../platform/api/api-client";
import type { components } from "../../platform/api/openapi";
import { ApiError } from "../../platform/api/api-error";
import { isAssetId } from "./profile-submission";
export { isAssetId } from "./profile-submission";

export type UserProfile = components["schemas"]["UserProfileVO"];
export type ProfilePatch = components["schemas"]["UpdateProfileDto"];
export interface ProfileContext {
  userId: number;
  account: string;
  nickname: string;
  avatarUrl: string | null;
  canEdit: boolean;
  canUpload: boolean;
}
export interface ProfileRequestContext {
  epoch: number;
  signal: AbortSignal;
}
export async function readProfileContext(
  expected: { userId: number; account: string },
  context: ProfileRequestContext,
): Promise<ProfileContext> {
  context.signal.throwIfAborted();
  const value = await apiRequest<components["schemas"]["CurrentUserVO"]>(
    "/auth/me",
    {
      cache: "no-store",
      signal: context.signal,
      expectedSessionEpoch: context.epoch,
    },
  );
  context.signal.throwIfAborted();
  if (value.userId !== expected.userId || value.account !== expected.account)
    throw new ApiError("资料账号已变化，请重新登录。", {
      status: 403,
      code: null,
      traceId: null,
    });
  assertDisplay(value);
  if (!Array.isArray(value.permissionKeys)) throw new Error("资料权限响应无效");
  return {
    userId: value.userId,
    account: value.account,
    nickname: value.nickname,
    avatarUrl: value.avatarUrl,
    canEdit: value.permissionKeys.includes("account:profile:update"),
    canUpload: value.permissionKeys.includes("asset:upload"),
  };
}
export async function updateProfile(
  body: ProfilePatch,
  context: ProfileRequestContext,
  expected: { userId: number; account: string },
) {
  context.signal.throwIfAborted();
  const value = await apiRequest<UserProfile>("/account/profile", {
    method: "PATCH",
    body,
    signal: context.signal,
    expectedSessionEpoch: context.epoch,
  });
  context.signal.throwIfAborted();
  if (
    value.userId !== expected.userId ||
    value.account !== expected.account ||
    (value.avatarAssetId !== null && !isAssetId(value.avatarAssetId))
  )
    throw new Error("资料保存响应与账号不符，结果需人工核对");
  assertDisplay(value);
  return value;
}
export async function uploadAvatar(
  body: FormData,
  context: ProfileRequestContext,
) {
  context.signal.throwIfAborted();
  const value = await apiRequest<components["schemas"]["AssetVO"]>("/assets", {
    method: "POST",
    body,
    signal: context.signal,
    expectedSessionEpoch: context.epoch,
  });
  context.signal.throwIfAborted();
  if (!isAssetId(value.assetId) || typeof value.status !== "string")
    throw new Error("头像上传响应无效，请刷新并核对");
  return value;
}
function assertDisplay(value: { nickname: string; avatarUrl: string | null }) {
  if (
    typeof value.nickname !== "string" ||
    !value.nickname.trim() ||
    Array.from(value.nickname).length > 50 ||
    (value.avatarUrl !== null && typeof value.avatarUrl !== "string")
  )
    throw new Error("资料显示响应无效");
}
