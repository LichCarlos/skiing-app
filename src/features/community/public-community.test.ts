import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../platform/api/api-client";
import { communityFeedParams, communityKeys } from "./community-query";
import { getDynamics, getDynamic, getComments } from "./community-api";
const request = vi.mocked(apiRequest);
beforeEach(() => {
  request.mockReset();
});
describe("Community public reads and identity boundaries", () => {
  it("encodes keyword and opaque cursor without caller identities or moderation fields", () => {
    const params = communityFeedParams({
      keyword: " 雪 & %_ ",
      cursor: "opaque_9-A",
      limit: 12,
    });
    expect(Object.fromEntries(params)).toEqual({
      keyword: "雪 & %_",
      cursor: "opaque_9-A",
      limit: "12",
    });
  });
  it.each([
    { limit: 0 },
    { limit: 101 },
    { keyword: "雪".repeat(201) },
    { cursor: "bad&cursor" },
    { cursor: "x".repeat(513) },
  ])("rejects invalid feed query before requesting %j", async (query) => {
    await expect(getDynamics(query)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("partitions feed/detail keys and keeps exact account cache invalidation prefixes", () => {
    expect(communityKeys.feed(7, " snow ").slice(0, 2)).toEqual(
      communityKeys.feeds(7),
    );
    expect(communityKeys.feed(7, "snow")).not.toEqual(
      communityKeys.feed(8, "snow"),
    );
    expect(communityKeys.feed(null, "snow")).not.toEqual(
      communityKeys.feed(7, "snow"),
    );
    expect(communityKeys.detail(11, 7)).not.toEqual(
      communityKeys.detail(11, 8),
    );
  });
  it("forces guest likedByMe false on feed and detail without looking up a session", async () => {
    request
      .mockResolvedValueOnce({ items: [{ dynamicId: 11, likedByMe: true }] })
      .mockResolvedValueOnce({ dynamicId: 11, likedByMe: true });
    expect((await getDynamics({})).items[0]?.likedByMe).toBe(false);
    expect((await getDynamic(11)).likedByMe).toBe(false);
    expect(request.mock.calls.every(([path]) => path !== "/auth/me")).toBe(
      true,
    );
  });
  it("verifies personal reads and rejects another account before fetching the projection", async () => {
    request.mockResolvedValue({ userId: 8 });
    await expect(getDynamics({}, undefined, 7)).rejects.toThrow("账号");
    await expect(getDynamic(11, undefined, 7)).rejects.toThrow("账号");
    expect(request.mock.calls.every(([path]) => path === "/auth/me")).toBe(
      true,
    );
  });
  it("keeps a verified account's own like state", async () => {
    request
      .mockResolvedValueOnce({ userId: 7 })
      .mockResolvedValueOnce({ dynamicId: 11, likedByMe: true });
    expect((await getDynamic(11, undefined, 7)).likedByMe).toBe(true);
  });
  it("does not read or return a late response after unmount", async () => {
    const closed = new AbortController();
    closed.abort();
    await expect(getDynamics({}, closed.signal, 7)).rejects.toThrow("关闭");
    expect(request).not.toHaveBeenCalled();
    const late = new AbortController();
    request.mockImplementationOnce(async () => {
      late.abort();
      return { dynamicId: 11 };
    });
    await expect(getDynamic(11, late.signal)).rejects.toThrow("关闭");
  });
  it("stops between a late identity response and a personal feed read", async () => {
    const abort = new AbortController();
    request.mockImplementationOnce(async () => {
      abort.abort();
      return { userId: 7 };
    });
    await expect(getDynamics({}, abort.signal, 7)).rejects.toThrow("关闭");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([0, -1, 1.5, 2147483648, NaN])(
    "rejects invalid detail/comment parent %s before transport",
    async (id) => {
      await expect(getDynamic(id)).rejects.toThrow("编号");
      await expect(getComments(id, 1)).rejects.toThrow("编号");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1.5, 107374184])(
    "rejects invalid or overflowing comment page %s",
    async (page) => {
      await expect(getComments(11, page)).rejects.toThrow("页码");
      expect(request).not.toHaveBeenCalled();
    },
  );
});
