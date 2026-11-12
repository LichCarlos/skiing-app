import { QueryClient } from "@tanstack/react-query";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => native.token,
  setItemAsync: async (_key: string, token: string) => {
    native.token = token;
  },
  deleteItemAsync: async () => {
    native.token = null;
  },
}));
import { apiRequest } from "../src/platform/api/api-client";
import {
  login,
  logout,
  registerAccount,
} from "../src/platform/auth/auth-session";
import { clearSessionTokens } from "../src/platform/auth/secure-session";
import {
  createCommunitySession,
  communitySessionKeys,
} from "../src/features/community/community-session";
import { CommunityActionGate } from "../src/features/community/community-action-gate";
const api = new URL(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
const fixture = JSON.parse(
  process.env.COMMUNITY_MOBILE_FIXTURE_JSON ?? "null",
) as { databaseName: string; accounts: string[] };
const password = process.env.COMMUNITY_MOBILE_FIXTURE_PASSWORD;
const adminAccount = process.env.COMMUNITY_MOBILE_ADMIN_ACCOUNT;
const adminPassword = process.env.COMMUNITY_MOBILE_ADMIN_PASSWORD;
if (
  !["localhost", "127.0.0.1"].includes(api.hostname) ||
  fixture?.databaseName !== "linji_community_mobile_validation" ||
  !password ||
  !adminAccount ||
  !adminPassword
)
  throw new Error("Loopback API and disposable community fixture required");
const realFetch = globalThis.fetch;
const cache = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
const s = () => new AbortController().signal;
let target = 0,
  secondAuthor = 0,
  owner = 0;
const dynamicIds: number[] = [];
async function enter(index: number) {
  await logout();
  const user = await login({
    account: fixture.accounts[index]!,
    password: password!,
  });
  return { user, session: createCommunitySession(user.userId) };
}
function gateFor(
  session: ReturnType<typeof createCommunitySession>,
  userId: number,
) {
  const gate = new CommunityActionGate(
    userId,
    async (signal) => {
      await session.verify(signal);
      return { userId };
    },
    () => {},
    session.check,
  );
  gate.activate();
  return gate;
}
beforeAll(async () => {
  await clearSessionTokens();
  for (const account of fixture.accounts)
    await registerAccount({ account, password: password!, nickname: account });
  const a = await enter(0);
  owner = a.user.userId;
  for (let index = 0; index < 23; index++) {
    const row = await apiRequest<{ dynamicId: number }>("/dynamics", {
      method: "POST",
      body: { content: `community-mobile-${index}`, imageAssetIds: [] },
    });
    dynamicIds.push(row.dynamicId);
  }
  target = dynamicIds[0]!;
  const b = await enter(1);
  secondAuthor = b.user.userId;
  dynamicIds.push(
    (
      await apiRequest<{ dynamicId: number }>("/dynamics", {
        method: "POST",
        body: { content: "community-mobile-b", imageAssetIds: [] },
      })
    ).dynamicId,
  );
  await logout();
  await login({ account: adminAccount!, password: adminPassword! });
  for (const id of [...dynamicIds.slice(0, 22), dynamicIds[23]!])
    await apiRequest(`/admin/dynamics/${id}/moderation`, {
      method: "PATCH",
      body: { action: "approve", reason: "community mobile fixture" },
    });
  await apiRequest(`/admin/dynamics/${dynamicIds[21]}/moderation`, {
    method: "PATCH",
    body: { action: "hide", reason: "community mobile hidden fixture" },
  });
  await logout();
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await cache.cancelQueries();
  cache.clear();
  await logout();
  await clearSessionTokens();
});
describe("App community / actual HTTP, QueryClient, controllers and PostgreSQL", () => {
  it("guest cursor feed excludes pending/hidden rows and has no duplicate IDs", async () => {
    const guest = createCommunitySession(null);
    const first = await guest.feed("community-mobile", null, s());
    expect(first.items).toHaveLength(20);
    expect(first.hasNext).toBe(true);
    const second = await guest.feed("community-mobile", first.nextCursor, s());
    expect(second.items).toHaveLength(2);
    expect(second.hasNext).toBe(false);
    const items = [...first.items, ...second.items];
    expect(new Set(items.map((item) => item.dynamicId)).size).toBe(22);
    expect(items.every((item) => item.likedByMe === false)).toBe(true);
    expect(items.map((item) => item.dynamicId)).not.toContain(dynamicIds[21]);
    expect(items.map((item) => item.dynamicId)).not.toContain(dynamicIds[22]);
  });
  it("serializes like commands, reads latest state and isolates the other account", async () => {
    const a = await enter(0),
      gate = gateFor(a.session, a.user.userId);
    let commands = 0;
    vi.stubGlobal(
      "fetch",
      async (url: Parameters<typeof fetch>[0], opts?: RequestInit) => {
        if (String(url).endsWith(`/dynamics/${target}/like`)) commands++;
        return realFetch(url, opts);
      },
    );
    const key = communitySessionKeys.detail(
      target,
      a.user.userId,
      a.session.epoch,
    );
    await cache.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) => a.session.readDetail(target, signal),
    });
    const call = gate.run(
      (signal, attempted) => a.session.toggleLike(target, signal, attempted),
      async () => {
        await cache.invalidateQueries({ queryKey: key });
      },
      true,
    );
    expect(
      await gate.run(
        (signal, attempted) => a.session.toggleLike(target, signal, attempted),
        () => {},
        true,
      ),
    ).toEqual({ status: "ignored" });
    expect(await call).toMatchObject({
      status: "success",
      value: { liked: true, likeCount: 1 },
    });
    expect(commands).toBe(1);
    expect((await a.session.readDetail(target, s())).likedByMe).toBe(true);
    const b = await enter(1);
    expect((await b.session.readDetail(target, s())).likedByMe).toBe(false);
    await expect(
      b.session.remove(target, "dynamic", s()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(a.session.readDetail(target, s())).rejects.toThrow();
    expect(commands).toBe(1);
    gate.dispose();
    vi.unstubAllGlobals();
  });
  it("does not repeat a committed comment after response loss, then paginates and deletes only the owner's comment", async () => {
    const a = await enter(0),
      gate = gateFor(a.session, owner);
    let posts = 0;
    vi.stubGlobal(
      "fetch",
      async (url: Parameters<typeof fetch>[0], opts?: RequestInit) => {
        const response = await realFetch(url, opts);
        if (
          String(url).endsWith(`/dynamics/${target}/comments`) &&
          opts?.method === "POST"
        ) {
          posts++;
          await response.arrayBuffer();
          throw new TypeError("synthetic response loss after commit");
        }
        return response;
      },
    );
    const write = (signal: AbortSignal, attempted: () => void) =>
      a.session.comment(
        target,
        "community-mobile-unconfirmed",
        signal,
        attempted,
      );
    expect(await gate.run(write, () => {}, true)).toMatchObject({
      status: "error",
      uncertain: true,
    });
    expect(await gate.run(write, () => {}, true)).toEqual({
      status: "ignored",
    });
    expect(posts).toBe(1);
    vi.unstubAllGlobals();
    const saved = await a.session.comments(target, 1, s());
    expect(saved.total).toBe(1);
    expect(saved.items[0]!.content).toBe("community-mobile-unconfirmed");
    gate.acknowledgeReview();
    for (let index = 0; index < 20; index++)
      expect(
        await gate.run(
          (signal, attempted) =>
            a.session.comment(
              target,
              `community-mobile-comment-${index}`,
              signal,
              attempted,
            ),
          () => {},
          true,
        ),
      ).toMatchObject({ status: "success" });
    const first = await a.session.comments(target, 1, s()),
      second = await a.session.comments(target, 2, s());
    expect(first.items).toHaveLength(20);
    expect(first.total).toBe(21);
    expect(second.items).toHaveLength(1);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.commentId))
        .size,
    ).toBe(21);
    const commentId = saved.items[0]!.commentId;
    const b = await enter(1);
    expect(b.user.userId).toBe(secondAuthor);
    await expect(
      b.session.remove(commentId, "comment", s()),
    ).rejects.toMatchObject({ status: 403 });
    const restored = await enter(0);
    await restored.session.remove(commentId, "comment", s());
    expect((await restored.session.comments(target, 1, s())).total).toBe(20);
    gate.dispose();
  });
  it("same-account relogin changes keys, blocks old epoch before fetch, and soft deletion removes the public target", async () => {
    const old = await enter(0),
      current = await enter(0);
    const spy = vi.fn(realFetch);
    vi.stubGlobal("fetch", spy);
    await expect(old.session.toggleLike(target, s())).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    expect(
      communitySessionKeys.detail(target, owner, old.session.epoch),
    ).not.toEqual(
      communitySessionKeys.detail(target, owner, current.session.epoch),
    );
    const gate = gateFor(current.session, owner);
    expect(
      await gate.run(
        (signal, attempted) =>
          current.session.remove(target, "dynamic", signal, attempted),
        () => {},
        true,
      ),
    ).toMatchObject({ status: "success" });
    await expect(current.session.readDetail(target, s())).rejects.toMatchObject(
      { status: 404 },
    );
    expect(
      (await current.session.feed("community-mobile", null, s())).items,
    ).toHaveLength(20);
    expect(
      (await apiRequest<{ total: number }>("/me/dynamics?page=1&pageSize=100"))
        .total,
    ).toBe(22);
    gate.dispose();
  });
});
