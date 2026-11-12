import type { components } from "../../platform/api/openapi";
import { apiRequest } from "../../platform/api/api-client";
import { ApiError } from "../../platform/api/api-error";
import { getOwnDynamics, type OwnDynamicStatus } from "./community-api";

export function ownDynamicId(input: unknown): number | null {
  if (typeof input !== "string" || !/^[1-9]\d*$/.test(input)) return null;
  const id = Number(input);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
export function ownDynamicsParams(input: {
  page: number;
  pageSize?: number;
  status?: OwnDynamicStatus;
}) {
  const size = input.pageSize ?? 20;
  if (
    !Number.isSafeInteger(input.page) ||
    input.page < 1 ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > 100 ||
    (input.page - 1) * size > 2147483647
  )
    throw new Error("本人动态页码无效");
  if (
    input.status !== undefined &&
    !["pending", "published", "hidden"].includes(input.status)
  )
    throw new Error("本人动态状态无效");
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(size),
  });
  if (input.status) params.set("status", input.status);
  return params;
}
export async function verifyOwnDynamicAccount(
  userId: number,
  signal: AbortSignal,
  deleting = false,
) {
  signal.throwIfAborted();
  const me = await apiRequest<components["schemas"]["CurrentUserVO"]>(
    "/auth/me",
    { signal, cache: "no-store" },
  );
  signal.throwIfAborted();
  if (
    me.userId !== userId ||
    !me.permissionKeys.includes("community:dynamic:read-own") ||
    (deleting && !me.permissionKeys.includes("community:dynamic:update-own"))
  )
    throw new ApiError("本人动态身份或权限已变化", {
      status: 403,
      code: null,
      traceId: null,
    });
}
export async function readOwnDynamics(
  userId: number,
  input: { page: number; status?: OwnDynamicStatus },
  signal: AbortSignal,
) {
  ownDynamicsParams(input);
  await verifyOwnDynamicAccount(userId, signal);
  const result = await getOwnDynamics(input, signal);
  signal.throwIfAborted();
  await verifyOwnDynamicAccount(userId, signal);
  if (
    result.page !== input.page ||
    result.items.some((item) => item.author.userId !== userId)
  )
    throw new Error("本人动态响应与当前账号或页码不符");
  return result;
}
export const ownDynamicKeys = {
  lists: (userId: number) => ["own-dynamics", userId] as const,
  list: (userId: number, page: number, status?: OwnDynamicStatus) =>
    ["own-dynamics", userId, status ?? "all", page] as const,
  detail: (userId: number, id: number) => ["own-dynamic", userId, id] as const,
};
