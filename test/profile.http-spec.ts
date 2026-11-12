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
import {
  login,
  logout,
  restoreSession,
} from "../src/platform/auth/auth-session";
import { SessionController } from "../src/platform/auth/session-controller";
import {
  clearSessionTokens,
  sessionEpoch,
  subscribeSessionChange,
} from "../src/platform/auth/secure-session";
import {
  readProfileContext,
  updateProfile,
} from "../src/features/profile/profile-api";
import { ProfileRun } from "../src/features/profile/profile-run";
const api = new URL(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
const fixture = JSON.parse(process.env.PROFILE_HTTP_FIXTURE_JSON ?? "null") as {
  databaseName: string;
  accounts: string[];
  userIds: number[];
};
const password = process.env.PROFILE_HTTP_FIXTURE_PASSWORD;
if (
  !["localhost", "127.0.0.1"].includes(api.hostname) ||
  fixture?.databaseName !== "linji_profile_validation" ||
  !password
)
  throw new Error("Loopback service and disposable profile fixture required");
const originalFetch = globalThis.fetch,
  sessions: SessionController[] = [];
beforeAll(async () => {
  await clearSessionTokens();
});
afterAll(async () => {
  vi.unstubAllGlobals();
  sessions.forEach((s) => s.dispose());
  await clearSessionTokens();
});
async function prepare(index: number) {
  await clearSessionTokens();
  const session = new SessionController({
    login,
    logout,
    restore: restoreSession,
    profile: () => apiRequest("/auth/me"),
    subscribe: subscribeSessionChange,
    changed: () => {},
  });
  sessions.push(session);
  session.activate();
  await session.signIn({
    account: fixture.accounts[index]!,
    password: password!,
  });
  const expected = {
      userId: fixture.userIds[index]!,
      account: fixture.accounts[index]!,
    },
    epoch = sessionEpoch();
  const run = new ProfileRun<string>(expected, {
    read: (signal) => readProfileContext(expected, { epoch, signal }),
    pick: async () => {
      throw new Error("Picker is outside HTTP-only scope");
    },
    upload: async () => {
      throw new Error("Storage is outside HTTP-only scope");
    },
    patch: (body, signal) => updateProfile(body, { epoch, signal }, expected),
    saved: async (profile) => {
      session.applyProfile(profile);
    },
    changed: () => {},
  });
  run.activate();
  expect(await run.reload()).toBe(true);
  expect(run.snapshot().profile?.userId).toBe(expected.userId);
  return { run, session };
}
describe("App profile / real Native-style HTTP with independent Nest/PostgreSQL", () => {
  it("nickname-only PATCH preserves legacy avatar, explicit null clears it and session grants survive merge", async () => {
    const { run, session } = await prepare(0),
      grants = [...session.snapshot().user!.permissionKeys];
    expect(run.snapshot().profile?.avatarUrl).toBe(
      "https://legacy.example/avatar.png",
    );
    run.setNickname("  Profile preserved  ");
    expect(await run.save()).toBe(true);
    expect(session.snapshot().user).toMatchObject({
      nickname: "Profile preserved",
      avatarUrl: "https://legacy.example/avatar.png",
      permissionKeys: grants,
    });
    await run.reload();
    run.setNickname("Profile cleared");
    run.setAvatar("clear");
    expect(await run.save()).toBe(true);
    expect(session.snapshot().user).toMatchObject({
      nickname: "Profile cleared",
      avatarUrl: null,
      permissionKeys: grants,
    });
    await run.reload();
    expect(run.snapshot().profile).toMatchObject({
      nickname: "Profile cleared",
      avatarUrl: null,
    });
    run.dispose();
    await session.signOut();
    session.dispose();
  });
  it("committed response loss prevents replay; fresh read shows current data but explicit review is still required", async () => {
    const { run, session } = await prepare(1);
    let writes = 0;
    vi.stubGlobal(
      "fetch",
      async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
        const response = await originalFetch(url, options);
        if (
          String(url).endsWith("/account/profile") &&
          options?.method === "PATCH"
        ) {
          writes++;
          expect(response.status).toBe(200);
          throw new TypeError(
            "Injected response loss after real profile commit",
          );
        }
        return response;
      },
    );
    run.setNickname("Committed unknown");
    expect(await run.save()).toBe(false);
    expect(run.snapshot().needsReview).toBe(true);
    expect(session.snapshot().user?.nickname).toBe("Original profile");
    expect(await run.save()).toBe(false);
    expect(writes).toBe(1);
    run.dispose();
    run.activate();
    expect(await run.reload()).toBe(true);
    expect(run.snapshot()).toMatchObject({
      nickname: "Committed unknown",
      needsReview: true,
      reviewed: true,
    });
    expect(await run.save()).toBe(false);
    expect(writes).toBe(1);
    run.acknowledge();
    expect(run.snapshot().needsReview).toBe(false);
    expect(writes).toBe(1);
    vi.unstubAllGlobals();
    run.dispose();
    await session.signOut();
    session.dispose();
  });
});
