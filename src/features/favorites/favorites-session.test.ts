import { beforeEach, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ epoch: 8 }));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => identity.epoch,
  assertSessionEpoch: (expected: number) => {
    if (expected !== identity.epoch) throw new Error("session changed");
  },
}));
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../platform/api/api-client";
import {
  createFavoritesSession,
  createResortDetailSession,
  favoriteIdentityKey,
} from "./favorites-session";
import {
  readFavoriteState,
  verifyFavoriteAccount,
  writeFavorite,
} from "./favorites-api";
import { resortDetail } from "../../../test/fixtures/resort-detail";
const request = vi.mocked(apiRequest),
  signal = () => new AbortController().signal;
beforeEach(() => {
  identity.epoch = 8;
  request.mockReset();
});
describe("resort detail and favorites captured session", () => {
  it("binds every resort checkpoint to one epoch without requiring write permissions", async () => {
    request
      .mockResolvedValueOnce({ userId: 7 })
      .mockResolvedValueOnce(resortDetail)
      .mockResolvedValueOnce({ userId: 7 });
    const s = signal();
    expect(await createResortDetailSession(7, "12").read(s)).toBe(resortDetail);
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/resorts/12",
      "/auth/me",
    ]);
    for (const [, options] of request.mock.calls)
      expect(options).toEqual({
        signal: s,
        cache: "no-store",
        expectedSessionEpoch: 8,
      });
  });
  it("guest detail suppresses favorite state without identity calls", async () => {
    request.mockResolvedValue(resortDetail);
    expect(
      await createResortDetailSession(null, "12").read(signal()),
    ).toMatchObject({ favoriteByMe: false });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([1, 2, 3])(
    "same-account login at resort checkpoint %s rejects before the next HTTP request",
    async (checkpoint) => {
      let calls = 0;
      request.mockImplementation(async (path) => {
        if (++calls === checkpoint) identity.epoch++;
        return path === "/auth/me" ? { userId: 7 } : resortDetail;
      });
      await expect(
        createResortDetailSession(7, "12").read(signal()),
      ).rejects.toThrow("session");
      expect(request).toHaveBeenCalledTimes(checkpoint);
    },
  );
  it.each([undefined, ["12"], ["12", "13"], "01", "2147483648"])(
    "rejects ambiguous resort route %j",
    async (raw) => {
      await expect(
        createResortDetailSession(7, raw).read(signal()),
      ).rejects.toThrow("编号");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("rejects obsolete detail/list before HTTP, including guest detail", async () => {
    const detail = createResortDetailSession(null, "12"),
      list = createFavoritesSession(7);
    identity.epoch++;
    await expect(detail.read(signal())).rejects.toThrow("session");
    await expect(list.list(1, "all", signal())).rejects.toThrow("session");
    expect(request).not.toHaveBeenCalled();
  });
  it("list supplies its captured epoch and drops a late same-account response", async () => {
    const list = createFavoritesSession(7),
      s = signal();
    request.mockImplementation(async () => {
      identity.epoch++;
      return { items: [], page: 1, pageSize: 20, total: 0 };
    });
    await expect(list.list(1, "all", s)).rejects.toThrow("session");
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/me/favorites?page=1&pageSize=20",
      { signal: s, cache: "no-store", expectedSessionEpoch: 8 },
    );
  });
  it("guest cannot request personal favorites", async () => {
    await expect(
      createFavoritesSession(null).list(1, "all", signal()),
    ).rejects.toThrow("登录");
    expect(request).not.toHaveBeenCalled();
  });
  it.each(["verify", "state", "write"])(
    "rejects stale %s adapter before HTTP",
    async (kind) => {
      const s = signal(),
        target = { targetType: "resort", targetId: 12 } as const;
      identity.epoch++;
      if (kind === "write")
        expect(() => writeFavorite(target, false, s, 8)).toThrow("session");
      else
        await expect(
          kind === "verify"
            ? verifyFavoriteAccount(7, s, 8)
            : readFavoriteState(target, s, 8),
        ).rejects.toThrow("session");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("cache keys preserve account invalidation while separating sessions and targets", () => {
    const a = createResortDetailSession(7, "12"),
      b = createFavoritesSession(7);
    expect(a.key.slice(0, 2)).toEqual(["public-resort", 7]);
    expect(b.key.slice(0, 2)).toEqual(["member-favorites", 7]);
    identity.epoch++;
    expect(a.key).not.toEqual(createResortDetailSession(7, "12").key);
    expect(b.key).not.toEqual(createFavoritesSession(7).key);
    expect(a.key).not.toEqual(createResortDetailSession(7, "13").key);
  });
  it("workspace identity tracks grants/status/login while ignoring grant ordering", () => {
    const user = { userId: 7, account: "snow", permissionKeys: ["b", "a"] };
    const key = favoriteIdentityKey(user, "authenticated");
    expect(key).toBe(
      favoriteIdentityKey(
        { ...user, permissionKeys: ["a", "b"] },
        "authenticated",
      ),
    );
    expect(key).not.toBe(
      favoriteIdentityKey({ ...user, permissionKeys: [] }, "authenticated"),
    );
    expect(key).not.toBe(favoriteIdentityKey(user, "restoring"));
    identity.epoch++;
    expect(key).not.toBe(favoriteIdentityKey(user, "authenticated"));
  });
});
