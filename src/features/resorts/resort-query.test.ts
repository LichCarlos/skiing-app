import { describe, expect, it, vi } from "vitest";
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import type { apiRequest } from "../../platform/api/api-client";
import {
  buildResortQuery,
  emptyResortFilters,
  formatResortDistance,
  readPublicResortFitTags,
  readResorts,
  resortKeys,
  type ResortFilters,
  type ResortPage,
} from "./resort-query";

const filters: ResortFilters = {
  ...emptyResortFilters,
  keyword: " 雪 & 林 ",
  province: "吉林",
  city: "吉林市",
  district: "丰满区",
  minPrice: "0",
  maxPrice: "300",
  minRating: "4.2",
  latitude: "0",
  longitude: "0",
  openStatus: "limited",
  sortBy: "distance",
  sortOrder: "desc",
  fitTags: ["family", "a&b", "family"],
};
const page: ResortPage = {
  page: 1,
  pageSize: 20,
  total: 1,
  hasNext: false,
  items: [
    {
      resortId: 7,
      name: "雪场",
      region: { province: "吉林", city: "", district: null },
      coverUrl: null,
      rating: null,
      ratingCount: 0,
      distanceMeters: 0,
      startingPrice: null,
      fitTags: [],
      openStatus: "unknown",
      favoriteByMe: true,
      customFields: [],
    },
  ],
};
describe("resort mobile filters and session isolation", () => {
  it("composes all selected filters and preserves them on the next page", () => {
    const query = buildResortQuery(filters, 2);
    expect(Object.fromEntries(query)).toMatchObject({
      keyword: "雪 & 林",
      province: "吉林",
      city: "吉林市",
      district: "丰满区",
      minPrice: "0",
      maxPrice: "300",
      minRating: "4.2",
      latitude: "0",
      longitude: "0",
      openStatus: "limited",
      sortBy: "distance",
      sortOrder: "desc",
      page: "2",
      pageSize: "20",
    });
    expect(query.getAll("fitTags")).toEqual(["family", "a&b"]);
    expect(query.has("merchantId")).toBe(false);
    expect(buildResortQuery(emptyResortFilters).toString()).toBe(
      "page=1&pageSize=20&sortBy=name&sortOrder=asc",
    );
  });
  it.each([
    { minPrice: "-1" },
    { minPrice: "0.1" },
    { minPrice: "9007199254740992" },
    { minPrice: "20", maxPrice: "10" },
    { minRating: "5.1" },
    { minRating: "NaN" },
    { latitude: "0" },
    { longitude: "0" },
    { latitude: "91", longitude: "0" },
    { latitude: "0", longitude: "181" },
    { sortBy: "distance" },
    { sortBy: "private" },
    { sortOrder: "bad" },
    { openStatus: "pending" },
    { district: "x".repeat(51) },
    { fitTags: Array.from({ length: 21 }, (_, i) => String(i)) },
  ])("rejects invalid filter combinations: %j", (patch) => {
    expect(() =>
      buildResortQuery({ ...emptyResortFilters, ...patch } as ResortFilters),
    ).toThrow();
  });
  it.each([0, 1.5, 2147483648, Number.NaN])(
    "rejects unsafe page %s",
    (number) =>
      expect(() => buildResortQuery(emptyResortFilters, number)).toThrow(),
  );
  it("partitions cached pages by every applied filter and account", () => {
    const base = buildResortQuery(emptyResortFilters).toString(),
      selected = buildResortQuery(filters).toString();
    expect(resortKeys.list(null, base)).not.toEqual(resortKeys.list(7, base));
    expect(resortKeys.list(7, base)).not.toEqual(resortKeys.list(7, selected));
    expect(resortKeys.fitTags()).toEqual(["public-resort-fit-tags"]);
  });
  it("loads fit tags independently and honors request cancellation", async () => {
    const signal = new AbortController().signal;
    const request = vi
      .fn()
      .mockResolvedValue([{ value: "family", label: "亲子" }]);
    await expect(
      readPublicResortFitTags(signal, request as typeof apiRequest),
    ).resolves.toEqual([{ value: "family", label: "亲子" }]);
    expect(request).toHaveBeenCalledExactlyOnceWith("/resorts/fit-tags", {
      signal,
    });
    const abort = new AbortController();
    abort.abort();
    const cancelled = vi.fn();
    await expect(
      readPublicResortFitTags(abort.signal, cancelled as typeof apiRequest),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).not.toHaveBeenCalled();
  });
  it("forces guest favorites false and forwards the cancellation signal", async () => {
    const request = vi.fn().mockResolvedValue(page),
      signal = new AbortController().signal,
      query = buildResortQuery(filters);
    const result = await readResorts(
      query,
      null,
      signal,
      request as typeof apiRequest,
    );
    expect(result.items[0].favoriteByMe).toBe(false);
    expect(page.items[0].favoriteByMe).toBe(true);
    expect(request).toHaveBeenCalledExactlyOnceWith(`/resorts?${query}`, {
      signal,
      cache: "no-store",
    });
  });
  it("verifies current account before loading personalized pages", async () => {
    const request = vi
        .fn()
        .mockResolvedValueOnce({ userId: 7 })
        .mockResolvedValueOnce(page)
        .mockResolvedValueOnce({ userId: 7 }),
      signal = new AbortController().signal;
    expect(
      (
        await readResorts(
          buildResortQuery(filters),
          7,
          signal,
          request as typeof apiRequest,
        )
      ).items[0].favoriteByMe,
    ).toBe(true);
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      expect.stringContaining("/resorts?"),
      "/auth/me",
    ]);
    request.mockClear();
    request.mockResolvedValueOnce({ userId: 8 });
    await expect(
      readResorts(
        buildResortQuery(filters),
        7,
        signal,
        request as typeof apiRequest,
      ),
    ).rejects.toThrow("登录账号已变化");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("stops after account verification if the page closed while it was in flight", async () => {
    const abort = new AbortController();
    const request = vi.fn(async () => {
      abort.abort();
      return { userId: 7 };
    });
    await expect(
      readResorts(
        buildResortQuery(filters),
        7,
        abort.signal,
        request as typeof apiRequest,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not publish responses arriving after cancellation or issue already cancelled requests", async () => {
    const abort = new AbortController();
    const request = vi.fn(async () => {
      abort.abort();
      return page;
    });
    await expect(
      readResorts(
        buildResortQuery(filters),
        null,
        abort.signal,
        request as typeof apiRequest,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    request.mockClear();
    await expect(
      readResorts(
        buildResortQuery(filters),
        null,
        abort.signal,
        request as typeof apiRequest,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });
  it("propagates a failed list read without fabricated rows", async () => {
    await expect(
      readResorts(
        buildResortQuery(filters),
        null,
        new AbortController().signal,
        vi.fn().mockRejectedValue(new Error("offline")) as typeof apiRequest,
      ),
    ).rejects.toThrow("offline");
  });
  it("rejects personalized data when identity changes during the list request", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ userId: 7 })
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ userId: 8 });
    await expect(
      readResorts(
        buildResortQuery(emptyResortFilters),
        7,
        new AbortController().signal,
        request as typeof apiRequest,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("binds all reads to the caller epoch without emitting internal fields as query parameters", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ userId: 7 })
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ userId: 7 });
    const signal = new AbortController().signal;
    await readResorts(
      buildResortQuery(emptyResortFilters),
      7,
      signal,
      request as typeof apiRequest,
      12,
    );
    for (const [, options] of request.mock.calls)
      expect(options).toEqual({
        signal,
        cache: "no-store",
        expectedSessionEpoch: 12,
      });
  });
  it.each([
    { page: 2 },
    { pageSize: 10 },
    { total: -1 },
    { total: 1.1 },
    { hasNext: null },
    { items: null },
    { items: [{ ...page.items[0], favoriteByMe: null }] },
    { items: [{ ...page.items[0], resortId: 2147483648 }] },
    { total: 2, items: [page.items[0], page.items[0]] },
  ])(
    "rejects untrusted pagination or state instead of enabling actions %#",
    async (patch) => {
      const request = vi.fn().mockResolvedValue({ ...page, ...patch });
      await expect(
        readResorts(
          buildResortQuery(emptyResortFilters),
          null,
          new AbortController().signal,
          request as typeof apiRequest,
        ),
      ).rejects.toThrow("分页响应无效");
    },
  );
  it.each([
    null,
    [{ value: "a", label: null }],
    [{ value: "", label: "A" }],
    [
      { value: "a", label: "A" },
      { value: "a", label: "B" },
    ],
  ])("rejects invalid public tag catalogs %#", async (tags) => {
    const request = vi.fn().mockResolvedValue(tags);
    await expect(
      readPublicResortFitTags(
        new AbortController().signal,
        request as typeof apiRequest,
      ),
    ).rejects.toThrow("目录响应无效");
  });
  it("shows real zero distance, omits absent values, and converts larger distances", () => {
    expect(formatResortDistance(0)).toBe("0 米");
    expect(formatResortDistance(null)).toBeNull();
    expect(formatResortDistance(Number.NaN)).toBeNull();
    expect(formatResortDistance(-1)).toBeNull();
    expect(formatResortDistance(12345)).toBe("12.3 公里");
  });
});
