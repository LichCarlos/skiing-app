import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => native.token,
  setItemAsync: async (_k: string, v: string) => {
    native.token = v;
  },
  deleteItemAsync: async () => {
    native.token = null;
  },
}));
import { apiRequest } from "../src/platform/api/api-client";
import { clearSessionTokens } from "../src/platform/auth/secure-session";
import {
  login,
  logout,
  registerAccount,
} from "../src/platform/auth/auth-session";
import { createKnowledgeListSession } from "../src/features/knowledge/knowledge-list-session";
import { createArticleDetailSession } from "../src/features/knowledge/article-detail-session";
import { createFavoritePorts } from "../src/features/favorites/favorite-ports";
import { FavoriteRun } from "../src/features/favorites/favorite-run";
import { QueryClient } from "@tanstack/react-query";
import { sessionEpoch } from "../src/platform/auth/secure-session";
const api = new URL(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
const fixture = JSON.parse(
  process.env.KNOWLEDGE_LIST_FIXTURE_JSON ?? "null",
) as {
  databaseName: string;
  accounts: string[];
  articleIds: number[];
  categoryValues: string[];
};
const password = process.env.KNOWLEDGE_LIST_FIXTURE_PASSWORD;
if (
  !["localhost", "127.0.0.1"].includes(api.hostname) ||
  fixture?.databaseName !== "linji_knowledge_list_validation" ||
  !password
)
  throw new Error(
    "Loopback API and disposable knowledge-list fixture required",
  );
const signal = () => new AbortController().signal;
beforeAll(async () => {
  await clearSessionTokens();
  for (const account of fixture.accounts)
    await registerAccount({ account, password: password!, nickname: account });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await logout();
  await clearSessionTokens();
});
describe("knowledge list actual App HTTP / Nest / PostgreSQL", () => {
  it("reads categories and 12+2 public offset pages with stable ID tie order, excluding draft/withdrawn/deleted/inactive", async () => {
    const session = createKnowledgeListSession(null),
      categories = await session.categories(signal());
    expect(categories.map((c) => c.value)).toEqual(
      expect.arrayContaining(fixture.categoryValues),
    );
    expect(categories.some((c) => c.value === "validation-inactive")).toBe(
      false,
    );
    const a = await session.list("", "", 1, signal()),
      b = await session.list("", "", 2, signal());
    expect(a).toMatchObject({
      page: 1,
      pageSize: 12,
      total: 14,
      hasNext: true,
    });
    expect(b).toMatchObject({ page: 2, total: 14, hasNext: false });
    expect([...a.items, ...b.items].map((row) => row.articleId)).toEqual(
      fixture.articleIds.slice(0, 14).reverse(),
    );
    expect(a.items.every((row) => row.favoriteByMe === false)).toBe(true);
    expect((await session.list("", "", 3, signal())).items).toEqual([]);
  });
  it("supports case-insensitive title/summary search, literal wildcard characters and category conjunction", async () => {
    const session = createKnowledgeListSession(null);
    expect(
      (await session.list("%_", "", 1, signal())).items.map((r) => r.articleId),
    ).toEqual([fixture.articleIds[0]]);
    expect(
      (
        await session.list(
          "mixedcase keyword",
          fixture.categoryValues[1]!,
          1,
          signal(),
        )
      ).items.map((r) => r.articleId),
    ).toEqual([fixture.articleIds[1]]);
    expect(
      (
        await session.list(
          "mixedcase keyword",
          fixture.categoryValues[0]!,
          1,
          signal(),
        )
      ).total,
    ).toBe(0);
  });
  it("isolates favorites by account, refreshes same-account login and refuses old epochs before fetch", async () => {
    const a = await login({
      account: fixture.accounts[0]!,
      password: password!,
    });
    const old = createKnowledgeListSession(a.userId);
    await apiRequest("/me/favorites", {
      method: "PUT",
      body: { targetType: "article", targetId: fixture.articleIds[0] },
    });
    expect((await old.list("%_", "", 1, signal())).items[0]!.favoriteByMe).toBe(
      true,
    );
    await logout();
    const b = await login({
      account: fixture.accounts[1]!,
      password: password!,
    });
    const bs = createKnowledgeListSession(b.userId);
    expect((await bs.list("%_", "", 1, signal())).items[0]!.favoriteByMe).toBe(
      false,
    );
    await apiRequest("/me/favorites", {
      method: "PUT",
      body: { targetType: "article", targetId: fixture.articleIds[1] },
    });
    expect(
      (await bs.list("mixedcase", "", 1, signal())).items[0]!.favoriteByMe,
    ).toBe(true);
    await logout();
    await login({ account: fixture.accounts[1]!, password: password! });
    const realFetch = globalThis.fetch,
      spy = vi.fn(realFetch);
    vi.stubGlobal("fetch", spy);
    await expect(old.list("", "", 1, signal())).rejects.toThrow();
    await expect(bs.list("", "", 1, signal())).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    expect(
      (
        await createKnowledgeListSession(b.userId).list(
          "mixedcase",
          "",
          1,
          signal(),
        )
      ).items[0]!.favoriteByMe,
    ).toBe(true);
  });
  it("reads full public detail for guests and excludes deleted/draft/withdrawn/inactive articles", async () => {
    await logout();
    const detail = await createArticleDetailSession(
      null,
      String(fixture.articleIds[0]),
    ).read(signal());
    expect(detail).toMatchObject({
      articleId: fixture.articleIds[0],
      body: "Public validation body",
      favoriteByMe: false,
      authorName: null,
      category: { value: fixture.categoryValues[0] },
    });
    for (const id of fixture.articleIds.slice(14))
      await expect(
        createArticleDetailSession(null, String(id)).read(signal()),
      ).rejects.toMatchObject({ status: 404 });
  });
  it("reconciles a lost committed article favorite without replay, preserving explicit unfavorite and invalidating detail/list caches", async () => {
    const user = await login({
      account: fixture.accounts[0]!,
      password: password!,
    });
    const session = createArticleDetailSession(
      user.userId,
      String(fixture.articleIds[2]),
    );
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const target = { targetType: "article", targetId: session.id! } as const;
    const key = [...session.key, 1],
      listKey = ["public-articles", user.userId, session.epoch, "filters"];
    const before = await session.read(signal());
    expect(before.favoriteByMe).toBe(false);
    cache.setQueryData(key, before);
    cache.setQueryData(listKey, []);
    const run = new FavoriteRun({
      ...createFavoritePorts(user.userId, cache, session.epoch),
      changed: () => {},
    });
    run.activate();
    const realFetch = globalThis.fetch;
    let writes = 0,
      deletes = 0;
    const writeStatuses: number[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await realFetch(input, init);
        if (
          init?.method === "PUT" &&
          new URL(String(input)).pathname.endsWith("/me/favorites")
        ) {
          writes++;
          writeStatuses.push(response.status);
          throw new TypeError(
            "Synthetic response loss after committed favorite",
          );
        }
        if (init?.method === "DELETE") deletes++;
        return response;
      },
    );
    try {
      expect(await run.set(target, true)).toBe(true);
      expect(writes).toBe(1);
      expect(writeStatuses).toEqual([204]);
      expect(run.snapshot().needsReview).toBe(false);
      expect((await session.read(signal())).favoriteByMe).toBe(true);
      expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
      expect(cache.getQueryState(listKey)?.isInvalidated).toBe(true);
      expect(cache.getQueryData(key)).toEqual(before);
      expect(await run.set(target, false)).toBe(true);
      expect(deletes).toBe(1);
      expect((await session.read(signal())).favoriteByMe).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      run.dispose();
      await cache.cancelQueries();
      cache.clear();
    }
  });
  it("same-account login invalidates old detail reads and favorite ports before HTTP", async () => {
    const user = await login({
      account: fixture.accounts[0]!,
      password: password!,
    });
    const old = createArticleDetailSession(
      user.userId,
      String(fixture.articleIds[0]),
    );
    const cache = new QueryClient();
    const run = new FavoriteRun({
      ...createFavoritePorts(user.userId, cache, sessionEpoch()),
      changed: () => {},
    });
    run.activate();
    await logout();
    await login({ account: fixture.accounts[0]!, password: password! });
    const spy = vi.fn(globalThis.fetch);
    vi.stubGlobal("fetch", spy);
    try {
      await expect(old.read(signal())).rejects.toThrow();
      expect(
        await run.set({ targetType: "article", targetId: old.id! }, false),
      ).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      run.dispose();
      cache.clear();
    }
    expect(
      (
        await createArticleDetailSession(user.userId, String(old.id)).read(
          signal(),
        )
      ).favoriteByMe,
    ).toBe(true);
  });
  it("rejects a real detail response delayed until after a newer login", async () => {
    const user = await login({
      account: fixture.accounts[0]!,
      password: password!,
    });
    const session = createArticleDetailSession(
      user.userId,
      String(fixture.articleIds[0]),
    );
    const realFetch = globalThis.fetch;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let received = false,
      identityCalls = 0;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/auth/me")) identityCalls++;
        const response = await realFetch(input, init);
        if (url.pathname.endsWith(`/articles/${session.id}`)) {
          received = true;
          await gate;
        }
        return response;
      },
    );
    const read = session.read(signal());
    const rejected = expect(read).rejects.toMatchObject({ name: "AbortError" });
    try {
      await vi.waitFor(() => expect(received).toBe(true));
      await logout();
      await login({ account: fixture.accounts[0]!, password: password! });
      release();
      await rejected;
      expect(identityCalls).toBe(1);
    } finally {
      release();
      vi.unstubAllGlobals();
    }
  });
});
