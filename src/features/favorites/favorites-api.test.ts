import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../platform/api/api-client";
import {
  favoriteId,
  favoriteKeys,
  listFavorites,
  readFavoriteState,
  readResortDetail,
  verifyFavoriteAccount,
  writeFavorite,
  type FavoriteTarget,
} from "./favorites-api";

vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => 0,
  assertSessionEpoch: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const signal = () => new AbortController().signal;
const me = { userId: 7, permissionKeys: ["member:favorite:toggle"] };
const target: FavoriteTarget = { targetType: "resort", targetId: 12 };
import { resortDetail as resort } from "../../../test/fixtures/resort-detail";

describe("favorite contract, ownership and response boundaries", () => {
  it.each([
    undefined,
    null,
    [],
    ["1"],
    "",
    "0",
    "-1",
    "01",
    "1.2",
    " 1",
    "1e2",
    "2147483648",
    "9007199254740993",
  ])("rejects ambiguous route %j", (input) => {
    expect(favoriteId(input)).toBeNull();
  });
  it("accepts positive int4 and partitions cache by current account", () => {
    expect(favoriteId("1")).toBe(1);
    expect(favoriteId("2147483647")).toBe(2147483647);
    expect(favoriteKeys.list(7, "all")).not.toEqual(
      favoriteKeys.list(8, "all"),
    );
    expect(favoriteKeys.list(7, "all")).not.toEqual(
      favoriteKeys.list(7, "article"),
    );
    expect(favoriteKeys.resort(null, 12)).not.toEqual(
      favoriteKeys.resort(7, 12),
    );
  });
  it.each([0, -1, 1.5, NaN, 2147483648])(
    "rejects invalid target %s before networking",
    async (id) => {
      const invalid = { ...target, targetId: id };
      expect(() => writeFavorite(invalid, false, signal())).toThrow();
      await expect(readFavoriteState(invalid, signal())).rejects.toThrow();
      await expect(readResortDetail(id, 7, signal())).rejects.toThrow();
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each([0, -1, 1.5, NaN, 107374184])(
    "rejects invalid page %s before networking",
    async (page) => {
      await expect(listFavorites(page, "all", signal())).rejects.toThrow();
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("rejects unknown types and filters", async () => {
    expect(() =>
      writeFavorite({ ...target, targetType: "user" as never }, true, signal()),
    ).toThrow();
    await expect(listFavorites(1, "user" as never, signal())).rejects.toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each(["all", "resort", "article"] as const)(
    "uses only confirmed query parameters for %s",
    async (filter) => {
      const page = { items: [], page: 2, pageSize: 20, total: 20 };
      vi.mocked(apiRequest).mockResolvedValueOnce(page);
      const abort = signal();
      expect(await listFavorites(2, filter, abort)).toBe(page);
      expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
        `/me/favorites?page=2&pageSize=20${filter === "all" ? "" : `&targetType=${filter}`}`,
        { signal: abort, cache: "no-store", expectedSessionEpoch: 0 },
      );
    },
  );
  it.each([
    { page: 2 },
    { pageSize: 10 },
    { total: -1 },
    {
      items: [
        { targetType: "resort", target: { targetType: "article", id: 12 } },
      ],
    },
    {
      items: [
        { targetType: "article", target: { targetType: "article", id: 12 } },
      ],
    },
    {
      items: [
        {
          targetType: "resort",
          target: { targetType: "resort", id: 2147483648 },
        },
      ],
    },
  ])("rejects incompatible pagination or target %j", async (patch) => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      items: [],
      page: 1,
      pageSize: 20,
      total: 1,
      ...patch,
    });
    await expect(listFavorites(1, "resort", signal())).rejects.toThrow("不符");
  });
  it.each([
    { ...me, userId: 8 },
    { userId: 7, permissionKeys: [] },
  ])("refuses changed identity or revoked grant %j", async (response) => {
    vi.mocked(apiRequest).mockResolvedValueOnce(response);
    await expect(verifyFavoriteAccount(7, signal())).rejects.toMatchObject({
      status: 403,
    });
  });
  it.each(["resort", "article"] as const)(
    "writes desired state via confirmed %s routes without owner ID",
    async (targetType) => {
      const value = { targetType, targetId: 12 };
      const abort = signal();
      await writeFavorite(value, true, abort);
      await writeFavorite(value, false, abort);
      expect(apiRequest).toHaveBeenNthCalledWith(1, "/me/favorites", {
        method: "PUT",
        body: value,
        signal: abort,
        expectedSessionEpoch: 0,
      });
      expect(apiRequest).toHaveBeenNthCalledWith(
        2,
        `/me/favorites/${targetType}/12`,
        { method: "DELETE", signal: abort, expectedSessionEpoch: 0 },
      );
    },
  );
  it.each(["resort", "article"] as const)(
    "reads authoritative %s state including target identity",
    async (targetType) => {
      vi.mocked(apiRequest).mockResolvedValueOnce({
        [targetType === "resort" ? "resortId" : "articleId"]: 12,
        favoriteByMe: false,
      });
      expect(
        await readFavoriteState({ targetType, targetId: 12 }, signal()),
      ).toBe(false);
    },
  );
  it.each([
    { resortId: 13, favoriteByMe: true },
    { resortId: 12 },
    { resortId: 12, favoriteByMe: "false" },
  ])("does not infer state from invalid projection %j", async (response) => {
    vi.mocked(apiRequest).mockResolvedValueOnce(response);
    await expect(readFavoriteState(target, signal())).rejects.toThrow("无效");
  });
  it("keeps an unavailable source as an error rather than treating it as removed", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("404"));
    await expect(readFavoriteState(target, signal())).rejects.toThrow("404");
  });
  it("allows public browsing without the favorite grant and checks identity twice", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ ...me, permissionKeys: [] })
      .mockResolvedValueOnce(resort)
      .mockResolvedValueOnce(me);
    const abort = signal();
    expect(await readResortDetail(12, 7, abort)).toBe(resort);
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/auth/me", {
      signal: abort,
      cache: "no-store",
      expectedSessionEpoch: 0,
    });
    expect(apiRequest).toHaveBeenNthCalledWith(3, "/auth/me", {
      signal: abort,
      cache: "no-store",
      expectedSessionEpoch: 0,
    });
  });
  it("never exposes authenticated favorite state in a guest projection", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(resort);
    expect(await readResortDetail(12, null, signal())).toEqual({
      ...resort,
      favoriteByMe: false,
    });
    expect(apiRequest).toHaveBeenCalledOnce();
  });
  it("rejects an account changed during public detail read", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(me)
      .mockResolvedValueOnce(resort)
      .mockResolvedValueOnce({ userId: 8 });
    await expect(readResortDetail(12, 7, signal())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects another detail target", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ ...resort, resortId: 13 });
    await expect(readResortDetail(12, null, signal())).rejects.toThrow("目标");
  });
  it("stops aborted actions before networking", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(verifyFavoriteAccount(7, abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(listFavorites(1, "all", abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(readFavoriteState(target, abort.signal)).rejects.toMatchObject(
      { name: "AbortError" },
    );
    await expect(readResortDetail(12, 7, abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(() => writeFavorite(target, true, abort.signal)).toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each(["verify", "list", "state", "detail"])(
    "suppresses late %s responses after abort",
    async (stage) => {
      const abort = new AbortController();
      vi.mocked(apiRequest).mockImplementationOnce(async () => {
        abort.abort();
        return stage === "verify"
          ? me
          : stage === "list"
            ? { items: [], page: 1, pageSize: 20, total: 0 }
            : resort;
      });
      const task =
        stage === "verify"
          ? verifyFavoriteAccount(7, abort.signal)
          : stage === "list"
            ? listFavorites(1, "all", abort.signal)
            : stage === "state"
              ? readFavoriteState(target, abort.signal)
              : readResortDetail(12, null, abort.signal);
      await expect(task).rejects.toMatchObject({ name: "AbortError" });
    },
  );
});
