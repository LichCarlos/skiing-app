import type { components, operations } from "../../platform/api/openapi";
import { apiRequest } from "../../platform/api/api-client";
import { ApiError } from "../../platform/api/api-error";
import { validateResortPage } from "./resort-page-validation";

type Query = NonNullable<
  operations["PublicResortsController_list"]["parameters"]["query"]
>;
export type Resort = components["schemas"]["PublicResortCardVO"];
export type ResortPage = components["schemas"]["PublicResortPageVO"];
export type ResortFitTag = components["schemas"]["PublicResortFitTagVO"];
export type ResortFilters = Record<
  | "keyword"
  | "province"
  | "city"
  | "district"
  | "minPrice"
  | "maxPrice"
  | "minRating"
  | "latitude"
  | "longitude"
  | "openStatus",
  string
> & {
  sortBy: NonNullable<Query["sortBy"]>;
  sortOrder: NonNullable<Query["sortOrder"]>;
  fitTags: string[];
};
export const emptyResortFilters: ResortFilters = {
  keyword: "",
  province: "",
  city: "",
  district: "",
  minPrice: "",
  maxPrice: "",
  minRating: "",
  latitude: "",
  longitude: "",
  openStatus: "",
  sortBy: "name",
  sortOrder: "asc",
  fitTags: [],
};
export const resortSortLabels: Record<ResortFilters["sortBy"], string> = {
  name: "名称",
  price: "票价",
  rating: "评分",
  distance: "距离",
};
export const resortStatusLabels: Record<
  NonNullable<Query["openStatus"]>,
  string
> = {
  open: "营业",
  limited: "部分开放",
  closed: "暂停营业",
  unknown: "状态待更新",
};

export function buildResortQuery(
  input: ResortFilters,
  page = 1,
): URLSearchParams {
  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * 20 > 2147483647)
    throw new Error("页码无效，请重新筛选");
  for (const [key, label, max] of [
    ["keyword", "关键词", 100],
    ["province", "省份", 50],
    ["city", "城市", 50],
    ["district", "区县", 50],
  ] as const) {
    const text = input[key].trim();
    if (text.length > max) throw new Error(`${label}不能超过 ${max} 字符`);
    if (text) query.set(key, text);
  }
  const price = (key: "minPrice" | "maxPrice") => {
    const text = input[key].trim();
    if (!text) return undefined;
    const value = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(value))
      throw new Error("价格须为非负整数");
    query.set(key, String(value));
    return value;
  };
  const min = price("minPrice"),
    max = price("maxPrice");
  if (min !== undefined && max !== undefined && min > max)
    throw new Error("最低价格不能高于最高价格");
  const decimal = (
    key: "minRating" | "latitude" | "longitude",
    label: string,
    min: number,
    max: number,
  ) => {
    const text = input[key].trim();
    if (!text) return undefined;
    const value = Number(text);
    if (
      !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    )
      throw new Error(`${label}须在 ${min} 至 ${max} 之间`);
    query.set(key, String(value));
    return value;
  };
  decimal("minRating", "最低评分", 0, 5);
  const latitude = decimal("latitude", "纬度", -90, 90),
    longitude = decimal("longitude", "经度", -180, 180);
  if ((latitude === undefined) !== (longitude === undefined))
    throw new Error("请同时填写参考纬度和经度");
  if (
    !Object.hasOwn(resortSortLabels, input.sortBy) ||
    !["asc", "desc"].includes(input.sortOrder)
  )
    throw new Error("请选择有效排序");
  if (input.sortBy === "distance" && latitude === undefined)
    throw new Error("按距离排序需要填写参考纬度和经度");
  if (input.openStatus) {
    if (!Object.hasOwn(resortStatusLabels, input.openStatus))
      throw new Error("请选择有效营业状态");
    query.set("openStatus", input.openStatus);
  }
  if (input.fitTags.length > 20) throw new Error("最多选择 20 个适配标签");
  for (const tag of new Set(input.fitTags)) query.append("fitTags", tag);
  query.set("sortBy", input.sortBy);
  query.set("sortOrder", input.sortOrder);
  return query;
}
export const resortKeys = {
  list: (userId: number | null, query: string) =>
    ["public-resorts", userId, { query }] as const,
  fitTags: () => ["public-resort-fit-tags"] as const,
};
export async function readPublicResortFitTags(
  signal: AbortSignal,
  request: typeof apiRequest = apiRequest,
): Promise<ResortFitTag[]> {
  signal.throwIfAborted();
  const tags = await request<ResortFitTag[]>("/resorts/fit-tags", { signal });
  signal.throwIfAborted();
  if (
    !Array.isArray(tags) ||
    tags.some(
      (tag) =>
        !tag ||
        typeof tag.value !== "string" ||
        !tag.value ||
        typeof tag.label !== "string" ||
        !tag.label,
    ) ||
    new Set(tags.map((tag) => tag.value)).size !== tags.length
  )
    throw new Error("雪场标签目录响应无效，请重试");
  return tags;
}
export async function readResorts(
  query: URLSearchParams,
  userId: number | null,
  signal: AbortSignal,
  request: typeof apiRequest = apiRequest,
  expectedEpoch?: number,
): Promise<ResortPage> {
  signal.throwIfAborted();
  const options = {
    signal,
    cache: "no-store" as const,
    ...(expectedEpoch === undefined
      ? {}
      : { expectedSessionEpoch: expectedEpoch }),
  };
  const verify = async () => {
    if (userId === null) return;
    const me = await request<{ userId: number }>("/auth/me", options);
    signal.throwIfAborted();
    if (me.userId !== userId)
      throw new ApiError("登录账号已变化，请重新进入雪场页", {
        status: 403,
        code: null,
        traceId: null,
      });
  };
  await verify();
  signal.throwIfAborted();
  const page = await request<ResortPage>(`/resorts?${query}`, options);
  signal.throwIfAborted();
  await verify();
  signal.throwIfAborted();
  validateResortPage(page, query);
  return userId === null
    ? {
        ...page,
        items: page.items.map((resort) => ({ ...resort, favoriteByMe: false })),
      }
    : page;
}
export function formatResortDistance(meters: number | null): string | null {
  if (meters === null || !Number.isFinite(meters) || meters < 0) return null;
  return meters < 1000
    ? `${Math.round(meters)} 米`
    : `${(meters / 1000).toFixed(1)} 公里`;
}
