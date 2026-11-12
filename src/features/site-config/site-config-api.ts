import { apiRequest } from "../../platform/api/api-client";
import type { components } from "../../platform/api/openapi";
export type SiteConfig = components["schemas"]["PublicSiteConfigVO"];
export const siteConfigKey = ["public-site-config"] as const;
export async function getSiteConfig(signal?: AbortSignal): Promise<SiteConfig> {
  signal?.throwIfAborted();
  const value = await apiRequest<unknown>("/public/config", {
    cache: "no-store",
    skipAuthRefresh: true,
    signal,
  });
  signal?.throwIfAborted();
  return publicProjection(value);
}

function publicProjection(value: unknown): SiteConfig {
  const data = value as Partial<SiteConfig> | null;
  const text = (value: unknown, max: number, nullable = false) =>
    (nullable && value === null) ||
    (typeof value === "string" &&
      !!value.trim() &&
      Array.from(value).length <= max);
  if (
    !data ||
    !text(data.siteName, 50) ||
    !text(data.tagline, 200) ||
    !text(data.about, 10000, true) ||
    !text(data.contactEmail, 254, true) ||
    !text(data.privacyPolicy, 30000, true) ||
    !text(data.termsOfService, 30000, true) ||
    typeof data.revision !== "string" ||
    !/^[a-f0-9]{64}$/i.test(data.revision)
  )
    throw new TypeError("平台信息响应无效，请重试。");
  // Only the contract's public fields enter the query cache.
  return {
    siteName: data.siteName!,
    tagline: data.tagline!,
    about: data.about!,
    contactEmail: data.contactEmail!,
    privacyPolicy: data.privacyPolicy!,
    termsOfService: data.termsOfService!,
    revision: data.revision,
  };
}
export type PolicyKind = "about" | "privacyPolicy" | "termsOfService";
export function policyText(data: SiteConfig, kind: PolicyKind): string {
  return (
    data[kind] ??
    (kind === "about" ? "平台介绍尚未配置。" : "尚未发布正式内容。")
  );
}
