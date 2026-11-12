import { describe, expect, it } from "vitest";
import { resortDetail } from "../../../test/fixtures/resort-detail";
import { validateResortDetail } from "./resort-detail-validation";
describe("public resort detail response boundary", () => {
  it("accepts zero values, null optional fields and every public custom-field type", () => {
    validateResortDetail(
      {
        ...resortDetail,
        customFields: [null, "", 0, false, ["a"]].map((value, index) => ({
          fieldKey: String(index),
          label: "",
          value,
        })),
        officialUrl: "https://example.com",
      },
      12,
    );
  });
  it.each([
    null,
    {},
    { ...resortDetail, resortId: 13 },
    { ...resortDetail, region: null },
    { ...resortDetail, favoriteByMe: "true" },
    { ...resortDetail, rating: NaN },
    { ...resortDetail, rating: 6 },
    { ...resortDetail, ratingCount: -1 },
    { ...resortDetail, distanceMeters: -1 },
    { ...resortDetail, startingPrice: "NaN" },
    { ...resortDetail, fitTags: [null] },
    { ...resortDetail, openStatus: "published" },
    { ...resortDetail, openStatus: ["open"] },
    { ...resortDetail, description: null },
    { ...resortDetail, galleryUrls: [null] },
    { ...resortDetail, snowCondition: null },
    { ...resortDetail, latitude: 91 },
    { ...resortDetail, longitude: 181 },
    { ...resortDetail, updatedAt: "bad" },
    { ...resortDetail, officialUrl: "javascript:alert(1)" },
    {
      ...resortDetail,
      customFields: [{ fieldKey: "x", label: "X", value: {} }],
    },
  ])("rejects malformed detail before rendering %j", (value) => {
    expect(() => validateResortDetail(value, 12)).toThrow("无效");
  });
  it("rejects duplicate tag or dynamic-field keys", () => {
    const tag = { value: "x", label: "X" },
      field = { fieldKey: "x", label: "X", value: null };
    expect(() =>
      validateResortDetail({ ...resortDetail, fitTags: [tag, tag] }, 12),
    ).toThrow();
    expect(() =>
      validateResortDetail(
        { ...resortDetail, customFields: [field, field] },
        12,
      ),
    ).toThrow();
  });
});
