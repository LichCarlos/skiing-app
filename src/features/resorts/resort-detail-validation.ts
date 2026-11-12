import type { components } from "../../platform/api/openapi";

type Detail = components["schemas"]["PublicResortDetailVO"];
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const nullableText = (v: unknown) => v === null || text(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const date = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
function httpUrl(v: unknown) {
  if (!text(v)) return false;
  try {
    return ["https:", "http:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
}
function customField(v: unknown) {
  if (!object(v) || !text(v.fieldKey) || !v.fieldKey || !text(v.label))
    return false;
  return (
    v.value === null ||
    text(v.value) ||
    finite(v.value) ||
    typeof v.value === "boolean" ||
    (Array.isArray(v.value) && v.value.every(text))
  );
}
export function validateResortDetail(
  value: unknown,
  id: number,
): asserts value is Detail {
  if (
    !object(value) ||
    value.resortId !== id ||
    !text(value.name) ||
    !object(value.region) ||
    !text(value.region.province) ||
    !text(value.region.city) ||
    !nullableText(value.region.district) ||
    !nullableText(value.coverUrl) ||
    typeof value.favoriteByMe !== "boolean" ||
    !(
      value.rating === null ||
      (finite(value.rating) && value.rating >= 0 && value.rating <= 5)
    ) ||
    !Number.isSafeInteger(value.ratingCount) ||
    Number(value.ratingCount) < 0 ||
    !(
      value.distanceMeters === null ||
      (finite(value.distanceMeters) && value.distanceMeters >= 0)
    ) ||
    !(
      value.startingPrice === null ||
      (text(value.startingPrice) && /^\d+(?:\.\d+)?$/.test(value.startingPrice))
    ) ||
    !text(value.openStatus) ||
    !["open", "closed", "limited", "unknown"].includes(value.openStatus) ||
    !Array.isArray(value.fitTags) ||
    !value.fitTags.every(
      (t) => object(t) && text(t.value) && !!t.value && text(t.label),
    ) ||
    new Set(value.fitTags.map((t) => t.value)).size !== value.fitTags.length ||
    !Array.isArray(value.customFields) ||
    !value.customFields.every(customField) ||
    new Set(value.customFields.map((f) => f.fieldKey)).size !==
      value.customFields.length ||
    !["address", "openingHours", "trailSummary", "facilitySummary"].every(
      (key) => nullableText(value[key]),
    ) ||
    !(
      value.latitude === null ||
      (finite(value.latitude) && Math.abs(value.latitude) <= 90)
    ) ||
    !(
      value.longitude === null ||
      (finite(value.longitude) && Math.abs(value.longitude) <= 180)
    ) ||
    !text(value.description) ||
    !Array.isArray(value.galleryUrls) ||
    !value.galleryUrls.every(text) ||
    !object(value.snowCondition) ||
    !text(value.snowCondition.value) ||
    !text(value.snowCondition.label) ||
    !(
      value.snowCondition.verifiedAt === null ||
      date(value.snowCondition.verifiedAt)
    ) ||
    !(value.officialUrl === null || httpUrl(value.officialUrl)) ||
    !date(value.updatedAt)
  )
    throw new TypeError("雪场详情响应目标或字段无效，请重新加载");
}
