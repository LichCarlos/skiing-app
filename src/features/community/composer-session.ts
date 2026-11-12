import { contentMetadataValid } from "../content/markdown-model";
import { apiRequest } from "../../platform/api/api-client";
import { createImageUploadForm } from "../../platform/api/image-upload-form";
import { ApiError } from "../../platform/api/api-error";
import type { components } from "../../platform/api/openapi";
import {
  assertSessionEpoch,
  sessionEpoch,
} from "../../platform/auth/secure-session";
import type { OwnDynamicDetail } from "./community-api";
import {
  composerSnapshot,
  ComposerConflictError,
  type ComposerImage,
} from "./composer-model";
export { ComposerConflictError } from "./composer-model";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function assetId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}
export function validateComposerDetail(
  value: unknown,
  id: number,
  userId: number,
): asserts value is OwnDynamicDetail {
  if (
    !object(value) ||
    value.dynamicId !== id ||
    !object(value.author) ||
    value.author.userId !== userId ||
    typeof value.content !== "string" ||
    value.content.length > 20000 ||
    !contentMetadataValid(value) ||
    (value.contentFormat === "markdown_v1" && value.version === undefined) ||
    (value.customFields !== undefined && !object(value.customFields)) ||
    !["pending", "published", "hidden"].includes(String(value.status)) ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    typeof value.imageCount !== "number" ||
    !Number.isSafeInteger(value.imageCount) ||
    value.imageCount < 0 ||
    !Array.isArray(value.images) ||
    value.images.length > value.imageCount ||
    !value.images.every(
      (image) =>
        object(image) &&
        assetId(image.assetId) &&
        typeof image.url === "string",
    ) ||
    new Set(value.images.map((image: { assetId: string }) => image.assetId))
      .size !== value.images.length ||
    !(
      value.resort === null ||
      (object(value.resort) &&
        Number.isInteger(value.resort.resortId) &&
        Number(value.resort.resortId) > 0 &&
        Number(value.resort.resortId) <= 2147483647 &&
        typeof value.resort.name === "string")
    )
  )
    throw new TypeError("本人动态响应无效");
}
export function createComposerSession(
  userId: number,
  id: number | null,
  epoch = sessionEpoch(),
) {
  const check = (signal: AbortSignal) => {
    signal.throwIfAborted();
    assertSessionEpoch(epoch);
  };
  const request = async <T>(
    path: string,
    signal: AbortSignal,
    options: { method?: string; body?: unknown } = {},
  ) => {
    check(signal);
    const value = await apiRequest<T>(path, {
      ...options,
      signal,
      expectedSessionEpoch: epoch,
      cache: "no-store",
    });
    check(signal);
    return value;
  };
  const verify = async (signal: AbortSignal, extra: string[] = []) => {
    const me = await request<components["schemas"]["CurrentUserVO"]>(
      "/auth/me",
      signal,
    );
    const required = [
      id === null ? "community:dynamic:create" : "community:dynamic:update-own",
      ...(id === null ? [] : ["community:dynamic:read-own"]),
      ...extra,
    ];
    if (
      me.userId !== userId ||
      required.some((permission) => !me.permissionKeys.includes(permission))
    )
      throw new ApiError("发布账号或权限已变化", {
        status: 403,
        code: null,
        traceId: null,
      });
  };
  const read = async (signal: AbortSignal) => {
    if (id === null) throw new TypeError("创建动态没有原本");
    await verify(signal);
    const value = await request<OwnDynamicDetail>(`/me/dynamics/${id}`, signal);
    validateComposerDetail(value, id, userId);
    await verify(signal);
    return value;
  };
  return {
    epoch,
    check,
    verify,
    read,
    async upload(image: ComposerImage, signal: AbortSignal) {
      if (image.kind !== "new") throw new TypeError("原图不应重新上传");
      await verify(signal, ["asset:upload"]);
      const body = createImageUploadForm(image);
      const value = await request<components["schemas"]["AssetVO"]>(
        "/assets",
        signal,
        { method: "POST", body },
      );
      if (
        !object(value) ||
        !assetId(value.assetId) ||
        !["ready", "pending_scan", "rejected", "deleted"].includes(value.status)
      )
        throw new TypeError("上传结果无效");
      return value;
    },
    async remove(asset: string, signal: AbortSignal) {
      if (!assetId(asset)) throw new TypeError("资产编号无效");
      await verify(signal, ["asset:delete-own"]);
      await request<void>(`/assets/${asset}`, signal, { method: "DELETE" });
    },
    async save(
      input: components["schemas"]["UpdateDynamicDto"] & {
        content: string;
        imageAssetIds: string[];
      },
      baseline: OwnDynamicDetail | null,
      signal: AbortSignal,
      attempted: () => void,
    ) {
      if (id !== null) {
        const latest = await read(signal);
        if (
          !baseline ||
          composerSnapshot(latest) !== composerSnapshot(baseline)
        )
          throw new ComposerConflictError();
      }
      await verify(signal);
      attempted();
      const result = await request<components["schemas"]["DynamicMutationVO"]>(
        id === null ? "/dynamics" : `/dynamics/${id}`,
        signal,
        {
          method: id === null ? "POST" : "PATCH",
          body: {
            ...input,
            ...(id !== null &&
            baseline &&
            (input.contentFormat === "markdown_v1" ||
              baseline.contentFormat === "markdown_v1")
              ? { expectedVersion: baseline.version }
              : {}),
          },
        },
      );
      if (
        !object(result) ||
        !Number.isInteger(result.dynamicId) ||
        result.dynamicId < 1 ||
        result.dynamicId > 2147483647 ||
        (id !== null && result.dynamicId !== id) ||
        !["pending", "hidden"].includes(result.status)
      )
        throw new TypeError("动态提交结果无效");
      return result;
    },
  };
}
