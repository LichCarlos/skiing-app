import type { components } from "@/src/platform/api/openapi";
import { apiRequest } from "../../platform/api/api-client";
import { assertCommunityId, communityFeedParams } from "./community-query";

export type DynamicCard = components["schemas"]["DynamicCardVO"];
export type DynamicDetail = components["schemas"]["DynamicDetailVO"];
export type DynamicFeed = components["schemas"]["DynamicFeedVO"];
export type CommentPage = components["schemas"]["CommentPageVO"];
export type Comment = components["schemas"]["CommentVO"];
export type UploadedAsset = components["schemas"]["AssetVO"];
export type OwnDynamicCard = components["schemas"]["OwnDynamicCardVO"];
export type OwnDynamicDetail = components["schemas"]["OwnDynamicDetailVO"];
export type OwnDynamicPage = components["schemas"]["OwnDynamicPageVO"];
export type OwnDynamicStatus = OwnDynamicCard["status"];

export function getSelectableResorts(
  input: { page: number; keyword?: string },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: "10",
    sortBy: "name",
    sortOrder: "asc",
  });
  if (input.keyword?.trim()) params.set("keyword", input.keyword.trim());
  return apiRequest<components["schemas"]["PublicResortPageVO"]>(
    `/resorts?${params.toString()}`,
    { signal },
  );
}

export function getOwnDynamics(
  input: { page: number; pageSize?: number; status?: OwnDynamicStatus },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize ?? 20),
  });
  if (input.status) params.set("status", input.status);
  return apiRequest<OwnDynamicPage>(`/me/dynamics?${params.toString()}`, {
    signal,
  });
}

export function getOwnDynamic(id: number, signal?: AbortSignal) {
  assertCommunityId(id);
  return apiRequest<OwnDynamicDetail>(`/me/dynamics/${id}`, { signal });
}

async function verifyPublicReader(userId: number | null, signal?: AbortSignal) {
  assertReadOpen(signal);
  if (userId !== null) {
    const me = await apiRequest<{ userId: number }>("/auth/me", { signal });
    assertReadOpen(signal);
    if (me.userId !== userId) throw new Error("登录账号已变化，请重新加载动态");
  }
}
function assertReadOpen(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("页面已关闭");
}
export async function getDynamics(
  input: { cursor?: string | null; keyword?: string; limit?: number },
  signal?: AbortSignal,
  userId: number | null = null,
) {
  const params = communityFeedParams(input);
  await verifyPublicReader(userId, signal);
  const data = await apiRequest<DynamicFeed>(`/dynamics?${params}`, { signal });
  assertReadOpen(signal);
  return userId === null
    ? {
        ...data,
        items: data.items.map((item) => ({ ...item, likedByMe: false })),
      }
    : data;
}

export async function getDynamic(
  id: number,
  signal?: AbortSignal,
  userId: number | null = null,
) {
  assertCommunityId(id);
  await verifyPublicReader(userId, signal);
  const data = await apiRequest<DynamicDetail>(`/dynamics/${id}`, { signal });
  assertReadOpen(signal);
  return userId === null ? { ...data, likedByMe: false } : data;
}

export async function getComments(
  id: number,
  page: number,
  signal?: AbortSignal,
) {
  assertCommunityId(id);
  assertReadOpen(signal);
  if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * 20 > 2147483647)
    throw new Error("评论页码无效");
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  const data = await apiRequest<CommentPage>(
    `/dynamics/${id}/comments?${params.toString()}`,
    { signal },
  );
  assertReadOpen(signal);
  return data;
}

export function createDynamic(input: components["schemas"]["DynamicWriteDto"]) {
  return apiRequest<components["schemas"]["DynamicMutationVO"]>("/dynamics", {
    method: "POST",
    body: input,
  });
}

export function uploadCommunityImage(file: FormData) {
  return apiRequest<UploadedAsset>("/assets", { method: "POST", body: file });
}

export function deleteCommunityImage(assetId: string) {
  return apiRequest<void>(`/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  });
}

export function updateDynamic(
  id: number,
  input: components["schemas"]["UpdateDynamicDto"],
) {
  return apiRequest<components["schemas"]["DynamicMutationVO"]>(
    `/dynamics/${id}`,
    { method: "PATCH", body: input },
  );
}

export function deleteDynamic(id: number, signal?: AbortSignal) {
  assertCommunityId(id);
  return apiRequest<void>(`/dynamics/${id}`, {
    method: "DELETE",
    ...(signal ? { signal } : {}),
  });
}

export function createComment(
  id: number,
  content: string,
  signal?: AbortSignal,
) {
  return apiRequest<components["schemas"]["CommentMutationVO"]>(
    `/dynamics/${id}/comments`,
    {
      method: "POST",
      body: { content },
      ...(signal ? { signal } : {}),
    },
  );
}

export function deleteComment(id: number, signal?: AbortSignal) {
  return apiRequest<void>(`/comments/${id}`, {
    method: "DELETE",
    ...(signal ? { signal } : {}),
  });
}

export function setDynamicLiked(
  id: number,
  liked: boolean,
  signal?: AbortSignal,
) {
  return apiRequest<components["schemas"]["LikeStateVO"]>(
    `/dynamics/${id}/like`,
    {
      method: liked ? "PUT" : "DELETE",
      ...(signal ? { signal } : {}),
    },
  );
}
