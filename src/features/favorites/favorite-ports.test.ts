import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ epoch: 12 }));
vi.mock("../../platform/auth/secure-session", () => ({
  sessionEpoch: () => identity.epoch,
  assertSessionEpoch: (expected: number) => {
    if (expected !== identity.epoch) throw new Error("Session changed");
  },
}));
vi.mock("../../platform/api/api-client", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../platform/api/api-client";
import { createFavoritePorts } from "./favorite-ports";
import { FavoriteRun } from "./favorite-run";
const target = { targetType: "resort", targetId: 19 } as const;
const me = { userId: 7, permissionKeys: ["member:favorite:toggle"] };
const caches: QueryClient[] = [];
function setup(userId: number | null = 7) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  caches.push(cache);
  const ports = createFavoritePorts(userId, cache, 12),
    changed = vi.fn();
  const run = new FavoriteRun({ ...ports, changed });
  run.activate();
  return { cache, ports, run, changed };
}
beforeEach(() => {
  identity.epoch = 12;
  vi.resetAllMocks();
});
afterEach(async () => {
  for (const cache of caches.splice(0)) {
    await cache.cancelQueries();
    cache.clear();
  }
});
describe("favorite integration ports with real query cache", () => {
  it("cancels account list and detail fetches before a write, preserving another account's reads", async () => {
    const { cache, ports } = setup();
    const keys = [
      ["public-resorts", 7, { query: "page=2" }, 3],
      ["public-resort", 7, 19],
      ["member-favorites", 7, "all"],
      ["public-articles", 7, "ski"],
      ["public-article", 7, 1],
      ["public-resorts", 8, "page=1"],
    ];
    const signals: AbortSignal[] = [];
    const reads = keys.map((queryKey) =>
      cache
        .fetchQuery({
          queryKey,
          queryFn: ({ signal }) => {
            signals.push(signal);
            return new Promise<never>((_resolve, reject) => {
              signal.addEventListener("abort", () =>
                reject(new Error("aborted")),
              );
            });
          },
        })
        .catch(() => null),
    );
    await vi.waitFor(() => expect(signals).toHaveLength(6));
    await ports.prepare(new AbortController().signal);
    expect(signals.slice(0, 5).every((signal) => signal.aborted)).toBe(true);
    expect(signals[5]!.aborted).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
    await cache.cancelQueries();
    await Promise.all(reads);
  });
  it("reconciliation invalidates only the account projections, without flipping cached booleans", async () => {
    const { cache, ports } = setup();
    const own = ["public-resorts", 7, "filters"],
      other = ["public-resorts", 8, "filters"],
      tags = ["public-resort-fit-tags"];
    cache.setQueryData(own, { favoriteByMe: false });
    cache.setQueryData(other, { favoriteByMe: true });
    cache.setQueryData(tags, []);
    ports.reconciled(target, true);
    expect(cache.getQueryState(own)?.isInvalidated).toBe(true);
    expect(cache.getQueryData(own)).toEqual({ favoriteByMe: false });
    expect(cache.getQueryState(other)?.isInvalidated).toBe(false);
    expect(cache.getQueryState(tags)?.isInvalidated).toBe(false);
  });
  it("an obsolete same-user session cannot write, read, verify or invalidate a new session", async () => {
    const { cache, ports } = setup();
    const key = ["public-resorts", 7];
    cache.setQueryData(key, []);
    identity.epoch++;
    const signal = new AbortController().signal;
    await expect(ports.verify(signal)).rejects.toThrow("Session changed");
    await expect(ports.read(target, signal)).rejects.toThrow("Session changed");
    await expect(ports.write(target, true, signal)).rejects.toThrow(
      "Session changed",
    );
    await expect(ports.prepare(signal)).rejects.toThrow("Session changed");
    expect(() => ports.reconciled(target, true)).toThrow("Session changed");
    expect(apiRequest).not.toHaveBeenCalled();
    expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
  });
  it("rejects a session change after a network read before permitting any write", async () => {
    const { run } = setup();
    vi.mocked(apiRequest).mockImplementation(async () => {
      identity.epoch++;
      return me;
    });
    expect(await run.set(target, true)).toBe(false);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(run.snapshot().needsReview).toBe(false);
  });
  it("uses real adapters and an explicit desired state, then rereads rather than inverting the card", async () => {
    const { run, cache } = setup();
    let favorite = false;
    const key = ["public-resorts", 7];
    cache.setQueryData(key, { favoriteByMe: false });
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (path === "/auth/me") return me;
      if (path === "/resorts/19")
        return { resortId: 19, favoriteByMe: favorite };
      expect(path).toBe("/me/favorites");
      expect(options?.body).toEqual(target);
      expect(options?.method).toBe("PUT");
      favorite = true;
      return undefined;
    });
    expect(await run.set(target, true)).toBe(true);
    expect(favorite).toBe(true);
    expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
    expect(cache.getQueryData(key)).toEqual({ favoriteByMe: false });
    expect(await run.set(target, true)).toBe(true);
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.filter(([path]) => path === "/me/favorites"),
    ).toHaveLength(1);
  });
  it("guest and revoked grants cannot issue a favorite command", async () => {
    const guest = setup(null);
    expect(await guest.run.set(target, true)).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
    const user = setup();
    vi.mocked(apiRequest).mockResolvedValue({ ...me, permissionKeys: [] });
    expect(await user.run.set(target, true)).toBe(false);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it("aborted lifetime does not reach HTTP", async () => {
    const { ports } = setup(),
      controller = new AbortController();
    controller.abort();
    await expect(
      ports.write(target, true, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
