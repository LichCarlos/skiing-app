import { QueryClient } from "@tanstack/react-query";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  token: null as string | null,
  getItemAsync: vi.fn(async (): Promise<string | null> => native.token),
  setItemAsync: vi.fn(async (_key: string, value: string) => {
    native.token = value;
  }),
  deleteItemAsync: vi.fn(async () => {
    native.token = null;
  }),
}));
vi.mock("expo-secure-store", () => native);
import { apiRequest } from "../src/platform/api/api-client";
import { login, logout } from "../src/platform/auth/auth-session";
import {
  clearSessionTokens,
  sessionEpoch,
} from "../src/platform/auth/secure-session";
import { createFavoritePorts } from "../src/features/favorites/favorite-ports";
import { FavoriteRun } from "../src/features/favorites/favorite-run";
import { favoriteLedgerForAccount } from "../src/features/favorites/favorite-recovery";
import {
  createFavoritesSession,
  createResortDetailSession,
} from "../src/features/favorites/favorites-session";
import { writeFavorite } from "../src/features/favorites/favorites-api";
import {
  buildResortQuery,
  emptyResortFilters,
  readPublicResortFitTags,
  readResorts,
  resortKeys,
} from "../src/features/resorts/resort-query";
const api = new URL(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
const fixture = JSON.parse(process.env.RESORT_LIST_FIXTURE_JSON ?? "null") as {
  databaseName: string;
  accounts: string[];
  userIds: number[];
  resortIds: number[];
  tagValues: string[];
};
const password = process.env.RESORT_LIST_FIXTURE_PASSWORD;
if (
  !["localhost", "127.0.0.1"].includes(api.hostname) ||
  fixture?.databaseName !== "linji_resort_list_validation" ||
  !password
)
  throw new Error(
    "Loopback service and disposable resort-list fixture required",
  );
const originalFetch = globalThis.fetch,
  caches: QueryClient[] = [];
beforeAll(async () => {
  await clearSessionTokens();
});
afterAll(async () => {
  vi.unstubAllGlobals();
  for (const cache of caches) {
    await cache.cancelQueries();
    cache.clear();
  }
  await logout();
  await clearSessionTokens();
});
const signal = () => new AbortController().signal;
const target = (index: number) => ({
  targetType: "resort" as const,
  targetId: fixture.resortIds[index]!,
});
const loginStarts = new Map<number, number[]>();
async function fixtureLogin(index: number) {
  const starts = loginStarts.get(index) ?? [];
  // Respect the production five-attempt/60-second account bucket; never retry 429.
  while (starts.length >= 5) {
    const remaining = starts[0]! + 60_500 - Date.now();
    if (remaining > 0) await delay(Math.min(remaining, 30_000));
    while (starts.length && starts[0]! + 60_500 <= Date.now()) starts.shift();
  }
  starts.push(Date.now());
  loginStarts.set(index, starts);
  return login({ account: fixture.accounts[index]!, password: password! });
}
function mount(userId: number, cache: QueryClient, epoch: number) {
  const run = new FavoriteRun(
    {
      ...createFavoritePorts(userId, cache, epoch),
      changed: () => {},
    },
    favoriteLedgerForAccount(cache, userId),
  );
  run.activate();
  return run;
}
async function prepare(index: number, existingCache?: QueryClient) {
  await logout();
  const user = await fixtureLogin(index);
  expect(user.userId).toBe(fixture.userIds[index]);
  const epoch = sessionEpoch(),
    cache =
      existingCache ??
      new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (!existingCache) caches.push(cache);
  const run = mount(user.userId, cache, epoch);
  const query = buildResortQuery(emptyResortFilters),
    key = resortKeys.list(user.userId, query.toString());
  const list = () =>
    cache.fetchQuery({
      queryKey: key,
      staleTime: 0,
      queryFn: ({ signal }) =>
        readResorts(query, user.userId, signal, undefined, epoch),
    });
  return { run, user, epoch, cache, key, list };
}
describe("App resort list / real Native-style HTTP and PostgreSQL", () => {
  it("guest gets public tags, ALL selected tags, exact zero distance and offset pages without hidden resorts", async () => {
    const tags = await readPublicResortFitTags(signal());
    expect(tags.map((tag) => tag.value)).toEqual(
      expect.arrayContaining(fixture.tagValues.slice(0, 2)),
    );
    expect(tags.map((tag) => tag.value)).not.toContain(fixture.tagValues[2]);
    const first = await readResorts(
      buildResortQuery(emptyResortFilters),
      null,
      signal(),
    );
    const second = await readResorts(
      buildResortQuery(emptyResortFilters, 2),
      null,
      signal(),
    );
    expect(first).toMatchObject({ total: 22, hasNext: true });
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(2);
    expect(second.hasNext).toBe(false);
    const ids = [...first.items, ...second.items].map((row) => row.resortId);
    expect(new Set(ids).size).toBe(22);
    expect(ids).not.toContain(fixture.resortIds[22]);
    expect(first.items.every((row) => row.favoriteByMe === false)).toBe(true);
    const both = await readResorts(
      buildResortQuery({
        ...emptyResortFilters,
        fitTags: fixture.tagValues.slice(0, 2),
        latitude: "0",
        longitude: "0",
        sortBy: "distance",
      }),
      null,
      signal(),
    );
    expect(both.items.map((row) => row.resortId)).toEqual([
      fixture.resortIds[0],
    ]);
    expect(both.items[0]!.distanceMeters).toBe(0);
  });
  it("explicit favorites update only account projections; repeated add does not invert and another user sees false", async () => {
    const a = await prepare(0);
    const initial = await a.list();
    expect(initial.items[0]!.favoriteByMe).toBe(false);
    let commands = 0;
    vi.stubGlobal(
      "fetch",
      async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
        if (
          String(url).includes("/me/favorites") &&
          ["PUT", "DELETE"].includes(options?.method ?? "")
        )
          commands++;
        return originalFetch(url, options);
      },
    );
    expect(await a.run.set(target(0), true)).toBe(true);
    expect(await a.run.set(target(0), true)).toBe(true);
    expect(commands).toBe(1);
    expect(a.cache.getQueryState(a.key)?.isInvalidated).toBe(true);
    expect(a.cache.getQueryData(a.key)).toEqual(initial);
    expect((await a.list()).items[0]!.favoriteByMe).toBe(true);
    expect(await a.run.set(target(0), false)).toBe(true);
    expect((await a.list()).items[0]!.favoriteByMe).toBe(false);
    expect(await a.run.set(target(0), true)).toBe(true);
    expect(commands).toBe(3);
    const b = await prepare(1);
    expect((await b.list()).items[0]!.favoriteByMe).toBe(false);
    expect(await a.run.set(target(0), false)).toBe(false);
    expect(commands).toBe(3);
    a.run.dispose();
    b.run.dispose();
    vi.unstubAllGlobals();
  });
  it("committed response loss and failed reread block all further writes until read-only review succeeds", async () => {
    const b = await prepare(1);
    let commands = 0,
      committed = false;
    vi.stubGlobal(
      "fetch",
      async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
        const path = String(url);
        if (committed && path.endsWith(`/resorts/${fixture.resortIds[1]}`))
          return Response.json(
            { message: "Injected post-commit read outage" },
            { status: 503 },
          );
        const response = await originalFetch(url, options);
        if (path.endsWith("/me/favorites") && options?.method === "PUT") {
          commands++;
          expect(response.status).toBe(204);
          committed = true;
          throw new TypeError("Injected response loss after commit");
        }
        return response;
      },
    );
    expect(await b.run.set(target(1), true)).toBe(false);
    expect(b.run.snapshot().needsReview).toBe(true);
    expect(await b.run.set(target(0), true)).toBe(false);
    expect(commands).toBe(1);
    b.run.dispose();
    const replacement = mount(b.user.userId, b.cache, b.epoch);
    expect(replacement.snapshot().needsReview).toBe(true);
    expect(await replacement.set(target(0), true)).toBe(false);
    expect(await replacement.review()).toBe(false);
    expect(commands).toBe(1);
    vi.unstubAllGlobals();
    expect(await replacement.review()).toBe(true);
    expect(replacement.snapshot().needsReview).toBe(false);
    const page = await b.list();
    expect(
      page.items.find((row) => row.resortId === fixture.resortIds[1])!
        .favoriteByMe,
    ).toBe(true);
    expect(
      page.items.find((row) => row.resortId === fixture.resortIds[0])!
        .favoriteByMe,
    ).toBe(false);
    expect((await apiRequest<{ userId: number }>("/auth/me")).userId).toBe(
      fixture.userIds[1],
    );
    replacement.dispose();
  });
  it("a new screen waits for the detached committed request to settle, then reviews without another command", async () => {
    const a = await prepare(0);
    let arrived!: () => void,
      release!: () => void,
      commands = 0;
    const waiting = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
        const response = await originalFetch(url, options);
        if (
          String(url).endsWith("/me/favorites") &&
          options?.method === "PUT"
        ) {
          commands++;
          expect(response.status).toBe(204);
          arrived();
          await gate;
        }
        return response;
      },
    );
    const saving = a.run.set(target(2), true);
    let next: FavoriteRun | undefined;
    try {
      await waiting;
      a.run.dispose();
      next = mount(a.user.userId, a.cache, a.epoch);
      expect(next.snapshot()).toMatchObject({ busy: true, needsReview: true });
      expect(await next.set(target(3), true)).toBe(false);
      expect(await next.review()).toBe(false);
      release();
      expect(await saving).toBe(false);
      expect(next.snapshot()).toMatchObject({ busy: false, needsReview: true });
      expect(await next.review()).toBe(true);
      expect(commands).toBe(1);
      expect(
        (
          await createResortDetailSession(
            a.user.userId,
            String(target(2).targetId),
            a.epoch,
          ).read(signal())
        ).favoriteByMe,
      ).toBe(true);
      expect(await next.set(target(2), false)).toBe(true);
    } finally {
      release();
      await saving;
      next?.dispose();
      a.run.dispose();
      vi.unstubAllGlobals();
    }
  });
  it("unknown state survives same-account login but does not block another account in the same cache runtime", async () => {
    const a = await prepare(0);
    let committed = false,
      commands = 0;
    vi.stubGlobal(
      "fetch",
      async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
        const path = String(url);
        if (committed && path.endsWith(`/resorts/${target(3).targetId}`))
          return Response.json(
            { message: "Injected state read outage" },
            { status: 503 },
          );
        const response = await originalFetch(url, options);
        if (path.endsWith("/me/favorites") && options?.method === "PUT") {
          commands++;
          expect(response.status).toBe(204);
          committed = true;
          throw new TypeError("Injected committed response loss");
        }
        return response;
      },
    );
    expect(await a.run.set(target(3), true)).toBe(false);
    a.run.dispose();
    vi.unstubAllGlobals();
    const b = await prepare(1, a.cache);
    expect(b.run.snapshot()).toMatchObject({
      busy: false,
      needsReview: false,
      pending: null,
    });
    expect(await b.run.set(target(1), true)).toBe(true);
    b.run.dispose();
    const again = await prepare(0, a.cache);
    try {
      expect(again.run.snapshot()).toMatchObject({
        needsReview: true,
        pending: target(3),
      });
      expect(await again.run.set(target(0), false)).toBe(false);
      expect(await again.run.review()).toBe(true);
      expect(commands).toBe(1);
      expect(
        (
          await createResortDetailSession(
            again.user.userId,
            String(target(3).targetId),
            again.epoch,
          ).read(signal())
        ).favoriteByMe,
      ).toBe(true);
      expect(await again.run.set(target(3), false)).toBe(true);
    } finally {
      again.run.dispose();
    }
  });
  it("detail returns the full public projection and hides pending sources from guests", async () => {
    await logout();
    const detail = await createResortDetailSession(
      null,
      String(fixture.resortIds[0]),
    ).read(signal());
    expect(detail).toMatchObject({
      name: "List 00",
      description: "Synthetic public content",
      favoriteByMe: false,
      rating: 4.5,
      region: {
        province: "Test Province",
        city: "Test City",
        district: "Test District",
      },
    });
    expect(detail.galleryUrls).toEqual([]);
    expect(Number.isFinite(Date.parse(detail.updatedAt))).toBe(true);
    await expect(
      createResortDetailSession(null, String(fixture.resortIds[22])).read(
        signal(),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("personal favorites use real 20+2 offset pages, type filters, detail state and explicit removal", async () => {
    const a = await prepare(0),
      session = createFavoritesSession(a.user.userId, a.epoch);
    try {
      for (let i = 0; i < 22; i++)
        await writeFavorite(target(i), true, signal(), a.epoch);
      const first = await a.run.read(signal(), (s) =>
        session.list(1, "all", s),
      );
      const second = await a.run.read(signal(), (s) =>
        session.list(2, "resort", s),
      );
      expect(first.total).toBe(22);
      expect(first.items).toHaveLength(20);
      expect(second.total).toBe(22);
      expect(second.items).toHaveLength(2);
      const ids = [...first.items, ...second.items].map((r) => r.target.id);
      expect(new Set(ids).size).toBe(22);
      expect(ids).not.toContain(fixture.resortIds[22]);
      expect((await session.list(1, "article", signal())).total).toBe(0);
      const detail = createResortDetailSession(
        a.user.userId,
        String(fixture.resortIds[2]),
        a.epoch,
      );
      expect((await detail.read(signal())).favoriteByMe).toBe(true);
      expect(await a.run.set(target(2), false)).toBe(true);
      expect((await detail.read(signal())).favoriteByMe).toBe(false);
      expect((await session.list(1, "all", signal())).total).toBe(21);
    } finally {
      for (let i = 1; i < 22; i++)
        await writeFavorite(target(i), false, signal(), a.epoch);
      a.run.dispose();
    }
    const b = await prepare(1),
      page = await createFavoritesSession(b.user.userId).list(
        1,
        "all",
        signal(),
      );
    expect(page.total).toBe(1);
    expect(page.items[0]!.target.id).toBe(fixture.resortIds[1]);
    b.run.dispose();
  });
  it("same-account re-login prevents old detail, personal list and favorite commands before HTTP", async () => {
    const a = await prepare(0),
      detail = createResortDetailSession(
        a.user.userId,
        String(fixture.resortIds[0]),
        a.epoch,
      ),
      list = createFavoritesSession(a.user.userId, a.epoch);
    await fixtureLogin(0);
    const spy = vi.fn(originalFetch);
    vi.stubGlobal("fetch", spy);
    try {
      await expect(detail.read(signal())).rejects.toMatchObject({
        name: "AbortError",
      });
      await expect(list.list(1, "all", signal())).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(await a.run.set(target(0), false)).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      a.run.dispose();
    }
  });
  it.each(["detail", "favorites"] as const)(
    "a late real %s response cannot cross same-account login or trigger another identity lookup",
    async (kind) => {
      const a = await prepare(0),
        detail = createResortDetailSession(
          a.user.userId,
          String(fixture.resortIds[0]),
          a.epoch,
        ),
        list = createFavoritesSession(a.user.userId, a.epoch);
      let arrived!: () => void,
        release!: () => void,
        identityCalls = 0;
      const waiting = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.stubGlobal(
        "fetch",
        async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
          const path = new URL(String(url)).pathname;
          if (path.endsWith("/auth/me")) identityCalls++;
          const response = await originalFetch(url, options);
          if (
            kind === "detail"
              ? path.endsWith(`/resorts/${fixture.resortIds[0]}`)
              : path.endsWith("/me/favorites")
          ) {
            expect(response.status).toBe(200);
            arrived();
            await gate;
          }
          return response;
        },
      );
      const task =
        kind === "detail"
          ? detail.read(signal())
          : a.run.read(signal(), (s) => list.list(1, "all", s));
      const settled = task.then(
        () => null,
        (error: unknown) => error,
      );
      try {
        await waiting;
        await fixtureLogin(0);
        release();
        expect(await settled).toMatchObject({ name: "AbortError" });
        expect(identityCalls).toBe(1);
      } finally {
        release();
        await settled;
        vi.unstubAllGlobals();
        a.run.dispose();
      }
    },
  );
});
