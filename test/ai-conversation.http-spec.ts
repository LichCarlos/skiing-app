import { randomUUID } from "node:crypto";
import { QueryClient } from "@tanstack/react-query";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  token: null as string | null,
  getItemAsync: async () => native.token,
  setItemAsync: async (_key: string, token: string) => {
    native.token = token;
  },
  deleteItemAsync: async () => {
    native.token = null;
  },
}));
vi.mock("expo-secure-store", () => native);
import {
  login,
  logout,
  registerAccount,
} from "../src/platform/auth/auth-session";
import {
  clearSessionTokens,
  sessionEpoch,
} from "../src/platform/auth/secure-session";
import { apiRequest } from "../src/platform/api/api-client";
import { createAiSession, aiKeys } from "../src/features/ai/ai-session";
import { AiConversationRun } from "../src/features/ai/conversation-run";
import { AiConversationListRun } from "../src/features/ai/conversation-list-run";
import { aiTurnRecoveryFor } from "../src/features/ai/turn-recovery";
import { aiListRecoveryFor } from "../src/features/ai/list-recovery";
const api = new URL(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
const fixture = JSON.parse(process.env.AI_MOBILE_FIXTURE_JSON ?? "null") as {
  databaseName: string;
  publicResortId: number;
  answer: string;
};
const password = process.env.AI_MOBILE_FIXTURE_PASSWORD;
if (
  !["localhost", "127.0.0.1"].includes(api.hostname) ||
  fixture?.databaseName !== "linji_ai_mobile_validation" ||
  !password
)
  throw new Error(
    "Loopback API, disposable AI fixture and synthetic password required",
  );
const fetchReal = globalThis.fetch;
const cache = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
const signal = () => new AbortController().signal;
const accounts = [0, 1].map(() => `ai-mobile-${randomUUID().slice(0, 8)}`);
let sessionA: ReturnType<typeof createAiSession>, idA: string, idB: string;
let userA: number;
async function enter(index: number) {
  await logout();
  const user = await login({ account: accounts[index]!, password: password! });
  return { user, session: createAiSession(user.userId) };
}
function listRun(
  session: ReturnType<typeof createAiSession>,
  userId: number,
  created = (_item: { conversationId: string }) => {},
) {
  return new AiConversationListRun(
    {
      verify: session.verify,
      list: (page, s) => session.list(page, s),
      create: (s) => session.create(s),
      remove: (target, s) => session.remove(target, s),
      changed: () => {},
      created,
      removed: () => {},
    },
    aiListRecoveryFor(cache, userId),
  );
}
async function create(
  session: ReturnType<typeof createAiSession>,
  userId: number,
) {
  let id = "";
  const run = listRun(session, userId, (item) => {
    id = item.conversationId;
  });
  run.activate();
  await run.loadPage(1, signal());
  expect(await run.create()).toBe(true);
  run.dispose();
  return id;
}
function conversation(
  session: ReturnType<typeof createAiSession>,
  id: string,
  userId: number,
) {
  const run = new AiConversationRun(
    {
      requestId: randomUUID,
      verify: session.verify,
      send: (body, delta, s) => session.send(id, body, delta, s),
      changed: () => {},
      confirmed: () => {},
    },
    aiTurnRecoveryFor(cache, userId, id),
  );
  run.activate();
  return run;
}
beforeAll(async () => {
  await clearSessionTokens();
  for (const account of accounts)
    await registerAccount({
      account,
      password: password!,
      nickname: "AI HTTP member",
    });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await cache.cancelQueries();
  cache.clear();
  await logout();
  await clearSessionTokens();
});
describe("App AI / real HTTP, SSE, PostgreSQL and pgvector; synthetic external providers", () => {
  it("recovers lost creation across account re-entry, then replays the original completed message with a public citation", async () => {
    const entered = await enter(0);
    sessionA = entered.session;
    userA = entered.user.userId;
    // The server commits creation, but the client never receives the result.
    let creations = 0;
    vi.stubGlobal(
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const response = await fetchReal(input, init);
        if (
          String(input).endsWith("/ai/conversations") &&
          init?.method === "POST"
        ) {
          creations++;
          expect(response.status).toBe(201);
          await response.text();
          throw new TypeError("synthetic lost creation response");
        }
        return response;
      },
    );
    const originalList = listRun(sessionA, userA);
    originalList.activate();
    await originalList.loadPage(1, signal());
    expect(await originalList.create()).toBe(false);
    expect(originalList.snapshot().uncertain).toBe(true);
    originalList.dispose();
    const otherListAccount = await enter(1);
    expect(
      aiListRecoveryFor(cache, otherListAccount.user.userId).snapshot()
        .uncertain,
    ).toBe(false);
    expect((await otherListAccount.session.list(1, signal())).items).toEqual(
      [],
    );
    sessionA = (await enter(0)).session;
    const returnedList = listRun(sessionA, userA);
    returnedList.activate();
    try {
      expect(returnedList.snapshot().uncertain).toBe(true);
      expect(await returnedList.create()).toBe(false);
      returnedList.acknowledgeReview();
      expect(returnedList.snapshot().uncertain).toBe(true);
      const recovered = await returnedList.loadPage(1, signal());
      expect(recovered.total).toBe(1);
      idA = recovered.items[0]!.conversationId;
      expect(await returnedList.create()).toBe(false);
      returnedList.acknowledgeReview();
      expect(returnedList.snapshot().uncertain).toBe(false);
      expect(creations).toBe(1);
    } finally {
      returnedList.dispose();
      vi.unstubAllGlobals();
    }
    let dropped = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const response = await fetchReal(input, init);
        if (
          !dropped &&
          String(input).endsWith(`/ai/conversations/${idA}/messages`) &&
          init?.method === "POST"
        ) {
          const text = await response.text();
          const completed = /event:\s*completed/.exec(text);
          expect(completed).not.toBeNull();
          dropped = true;
          return new Response(text.slice(0, completed!.index), {
            status: response.status,
            headers: response.headers,
          });
        }
        return response;
      }),
    );
    const run = conversation(sessionA, idA, userA);
    expect(await run.send("初学者可以使用哪些雪道？")).toBe(false);
    const pending = run.snapshot().pending;
    expect(pending).not.toBeNull();
    expect(await run.send("new request")).toBe(false);
    run.dispose();
    const other = await enter(1);
    expect(aiTurnRecoveryFor(cache, other.user.userId, idA).snapshot()).toEqual(
      { busy: false, pending: null },
    );
    await expect(other.session.read(idA, signal())).rejects.toMatchObject({
      status: 404,
    });
    sessionA = (await enter(0)).session;
    const replacement = conversation(sessionA, idA, userA);
    expect(replacement.snapshot().pending).toEqual(pending);
    expect(await replacement.send("do not create a duplicate turn")).toBe(
      false,
    );
    expect(await replacement.retry()).toBe(true);
    expect(replacement.snapshot().confirmed[0]!.request).toEqual(pending);
    const message = replacement.snapshot().confirmed[0]!.message;
    expect(message.content).toBe(fixture.answer);
    expect(message.citations.map((citation) => citation.sourceId)).toEqual([
      String(fixture.publicResortId),
    ]);
    const history = await cache.fetchQuery({
      queryKey: aiKeys.detail(userA, sessionA.epoch, idA),
      queryFn: ({ signal: s }) => sessionA.read(idA, s),
    });
    expect(history.messages).toHaveLength(2);
    expect(
      history.messages
        .filter((item) => item.role === "assistant")
        .map((item) => item.messageId),
    ).toEqual([message.messageId]);
    expect(await apiRequest(`/resorts/${fixture.publicResortId}`)).toBeTruthy();
    replacement.dispose();
    vi.unstubAllGlobals();
  });
  it("retries the original key from a new screen while the old committed response is still delayed", async () => {
    let arrived!: () => void,
      release!: () => void,
      delayed = false;
    const waiting = new Promise<void>((resolve) => {
        arrived = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    const requests: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const response = await fetchReal(input, init);
        if (
          String(input).endsWith(`/ai/conversations/${idA}/messages`) &&
          init?.method === "POST"
        ) {
          requests.push(JSON.parse(String(init.body)));
          if (!delayed) {
            delayed = true;
            const text = await response.text();
            expect(text).toContain("event: completed");
            arrived();
            await gate;
            return new Response(text, {
              status: response.status,
              headers: response.headers,
            });
          }
        }
        return response;
      },
    );
    const old = conversation(sessionA, idA, userA),
      task = old.send("如何选择初级雪道？");
    let next: AiConversationRun | undefined;
    try {
      await waiting;
      const pending = old.snapshot().pending;
      old.dispose();
      next = conversation(sessionA, idA, userA);
      expect(next.snapshot().pending).toEqual(pending);
      expect(await next.send("new key is forbidden")).toBe(false);
      expect(await next.retry()).toBe(true);
      expect(requests).toHaveLength(2);
      expect(requests[0]).toEqual(requests[1]);
      const confirmed = next.snapshot().confirmed;
      release();
      expect(await task).toBe(false);
      expect(next.snapshot().confirmed).toEqual(confirmed);
      expect(next.snapshot().pending).toBeNull();
      expect((await sessionA.read(idA, signal())).messages).toHaveLength(4);
    } finally {
      release();
      await task;
      old.dispose();
      next?.dispose();
      vi.unstubAllGlobals();
    }
  });
  it("isolates a second user and rejects the first lifetime before making a request", async () => {
    const { user, session } = await enter(1);
    const fetchSpy = vi.fn(fetchReal);
    vi.stubGlobal("fetch", fetchSpy);
    await expect(sessionA.read(idA, signal())).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(sessionA.create(signal())).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(session.read(idA, signal())).rejects.toMatchObject({
      status: 404,
    });
    idB = await create(session, user.userId);
    const run = conversation(session, idB, user.userId);
    expect(await run.send("推荐初级雪道。")).toBe(true);
    const detail = await cache.fetchQuery({
      queryKey: aiKeys.detail(user.userId, session.epoch, idB),
      queryFn: ({ signal: s }) => session.read(idB, s),
    });
    expect(detail.messages).toHaveLength(2);
    expect(
      cache.getQueryData(aiKeys.detail(userA, sessionA.epoch, idA)),
    ).toBeTruthy();
    expect(aiKeys.detail(user.userId, session.epoch, idA)).not.toEqual(
      aiKeys.detail(userA, sessionA.epoch, idA),
    );
    run.dispose();
    vi.unstubAllGlobals();
  });
  it("retains a detached deletion across same-account re-entry until task settlement and explicit list review", async () => {
    const { session } = await enter(0);
    expect(session.epoch).toBe(sessionEpoch());
    expect(session.epoch).not.toBe(sessionA.epoch);
    await expect(sessionA.verify(signal())).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(session.read(idB, signal())).rejects.toMatchObject({
      status: 404,
    });
    expect((await session.read(idA, signal())).messages).toHaveLength(4);
    const run = listRun(session, userA);
    run.activate();
    await run.loadPage(1, signal());
    let arrived!: () => void,
      release!: () => void,
      deletions = 0;
    const waiting = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const response = await fetchReal(input, init);
        if (
          String(input).endsWith(`/ai/conversations/${idA}`) &&
          init?.method === "DELETE"
        ) {
          deletions++;
          const text = await response.text();
          expect(response.ok).toBe(true);
          arrived();
          await gate;
          return new Response(response.status === 204 ? null : text, {
            status: response.status,
            headers: response.headers,
          });
        }
        return response;
      },
    );
    const task = run.remove(idA);
    let returned: AiConversationListRun | undefined;
    try {
      await waiting;
      run.dispose();
      const reentered = await enter(0);
      returned = listRun(reentered.session, userA);
      returned.activate();
      expect((await returned.loadPage(1, signal())).items).toEqual([]);
      expect(returned.snapshot()).toMatchObject({
        busy: "delete",
        uncertain: true,
        reviewed: false,
      });
      returned.acknowledgeReview();
      expect(await returned.create()).toBe(false);
      expect(await returned.remove(idA)).toBe(false);
      release();
      expect(await task).toBe(false);
      expect(returned.snapshot()).toMatchObject({
        busy: null,
        uncertain: true,
        reviewed: false,
      });
      returned.acknowledgeReview();
      expect(returned.snapshot().uncertain).toBe(true);
      await returned.loadPage(1, signal());
      returned.acknowledgeReview();
      expect(returned.snapshot().uncertain).toBe(false);
      expect(deletions).toBe(1);
      await expect(reentered.session.read(idA, signal())).rejects.toMatchObject(
        { status: 404 },
      );
    } finally {
      release();
      await task;
      run.dispose();
      returned?.dispose();
      vi.unstubAllGlobals();
    }
  });
});
