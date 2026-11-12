import { describe, expect, it } from "vitest";
import { validateFavoritePage } from "./favorites-validation";
const row = {
  favoriteId: "9007199254740993",
  targetType: "resort",
  favoritedAt: "2026-11-02T00:00:00Z",
  target: {
    targetType: "resort",
    id: 12,
    name: "Snow",
    province: null,
    city: "",
    district: null,
    rating: 0,
    startingPrice: "0.00",
  },
};
const page = () => ({
  items: [structuredClone(row)],
  page: 1,
  pageSize: 20,
  total: 1,
});
describe("favorite page response boundary", () => {
  it("preserves bigint identifiers and validates both target variants", () => {
    const value = page();
    validateFavoritePage(value, 1, "resort");
    expect(value.items[0]!.favoriteId).toBe("9007199254740993");
    validateFavoritePage(
      {
        ...value,
        items: [
          {
            ...row,
            targetType: "article",
            target: {
              targetType: "article",
              id: 12,
              title: "Snow",
              summary: "",
              category: "safety",
              publishedAt: row.favoritedAt,
            },
          },
        ],
      },
      1,
      "article",
    );
  });
  it("accepts empty pages beyond the last offset", () => {
    validateFavoritePage({ ...page(), page: 2, items: [] }, 2, "all");
  });
  it.each([
    null,
    {},
    { ...page(), total: -1 },
    { ...page(), pageSize: 19 },
    { ...page(), items: [] },
    { ...page(), total: 2 },
    { ...page(), items: [row, row], total: 2 },
  ])("rejects inconsistent pages %j", (value) => {
    expect(() => validateFavoritePage(value, 1, "all")).toThrow("不符");
  });
  it.each([
    { favoriteId: 9 },
    { favoriteId: "01" },
    { favoritedAt: "bad" },
    { target: null },
    { targetType: "article" },
  ])("rejects malformed rows %j", (patch) => {
    expect(() =>
      validateFavoritePage(
        { ...page(), items: [{ ...row, ...patch }] },
        1,
        "all",
      ),
    ).toThrow();
  });
  it.each([
    { id: 2147483648 },
    { name: null },
    { rating: 6 },
    { startingPrice: 0 },
    { startingPrice: "NaN" },
    { city: 7 },
  ])("rejects malformed resort summaries %j", (patch) => {
    expect(() =>
      validateFavoritePage(
        { ...page(), items: [{ ...row, target: { ...row.target, ...patch } }] },
        1,
        "all",
      ),
    ).toThrow();
  });
  it("rejects duplicate targets even under distinct favorite IDs, and mismatched filters", () => {
    expect(() =>
      validateFavoritePage(
        { ...page(), total: 2, items: [row, { ...row, favoriteId: "2" }] },
        1,
        "all",
      ),
    ).toThrow();
    expect(() => validateFavoritePage(page(), 1, "article")).toThrow();
  });
});
