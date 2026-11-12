import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// Native OS storage is the only substituted adapter. Every HTTP response comes
// from the independently started production Nest server and PostgreSQL.
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
  sessionEpoch,
  readAccessToken,
  readRefreshToken,
  subscribeSessionChange,
  clearSessionTokens,
} from "../src/platform/auth/secure-session";
import {
  changeOwnPassword,
  finishSettingsSession,
  verifySettingsAccount,
} from "../src/features/settings/settings-api";
import { SettingsRun } from "../src/features/settings/settings-run";
const api = new URL(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
const fixture = JSON.parse(
  process.env.SETTINGS_HTTP_FIXTURE_JSON ?? "null",
) as {
  databaseName: string;
  accounts: string[];
  userIds: number[];
};
const password = process.env.SETTINGS_HTTP_FIXTURE_PASSWORD;
const replacement = "native-http-replacement";
if (
  !["localhost", "127.0.0.1"].includes(api.hostname) ||
  fixture?.databaseName !== "linji_settings_validation" ||
  !password
)
  throw new Error("Loopback service and disposable settings fixture required");
const originalFetch = globalThis.fetch;
const sessions: SessionController[] = [];
beforeAll(async () => {
  await clearSessionTokens();
});
afterAll(async () => {
  vi.unstubAllGlobals();
  sessions.forEach((s) => s.dispose());
  await clearSessionTokens();
});
async function prepare(index: number) {
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
  const user = session.snapshot().user!;
  expect(user.userId).toBe(fixture.userIds[index]);
  const epoch = sessionEpoch(),
    navigate = vi.fn();
  const run = new SettingsRun({
    verify: (signal) => verifySettingsAccount(user.userId, epoch, signal),
    write: (body, signal) => changeOwnPassword(body, epoch, signal),
    finish: (mode) =>
      finishSettingsSession(mode, epoch, {
        logout: () => session.signOut(),
        navigate,
      }),
    changed: () => {},
  });
  run.activate();
  const access = readAccessToken()!,
    refresh = (await readRefreshToken())!;
  return { run, session, navigate, access, refresh };
}
const body = () => ({
  currentPassword: password!,
  newPassword: replacement,
  confirmPassword: replacement,
});
async function revoked(access: string, refresh: string) {
  expect(
    (
      await originalFetch(`${api.href}/auth/me`, {
        headers: { Authorization: `Bearer ${access}` },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await originalFetch(`${api.href}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      })
    ).status,
  ).toBe(401);
}
describe("App settings / real native-style HTTP with independent Nest/PostgreSQL", () => {
  it("a wrong current password is a definite denial, then 204 invalidates UI, memory and all sessions", async () => {
    const { run, session, navigate, access, refresh } = await prepare(0);
    expect(
      await run.submit({
        ...body(),
        currentPassword: "wrong-current-password",
      }),
    ).toBe(false);
    expect(run.snapshot()).toMatchObject({ unknown: false, confirmed: false });
    expect(session.snapshot().status).toBe("authenticated");
    expect(await run.submit(body())).toBe(true);
    expect(run.snapshot()).toMatchObject({ confirmed: true, unknown: false });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("changed");
    expect(session.snapshot()).toMatchObject({
      user: null,
      status: "anonymous",
    });
    expect(readAccessToken()).toBeNull();
    expect(await readRefreshToken()).toBeNull();
    await revoked(access, refresh);
    run.dispose();
    session.dispose();
  });
  it("a committed response lost in transport blocks replay and explicit exit cleans the obsolete session", async () => {
    const { run, session, navigate, access, refresh } = await prepare(1);
    let writes = 0;
    vi.stubGlobal(
      "fetch",
      async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
        const response = await originalFetch(url, options);
        if (
          String(url).endsWith("/account/password") &&
          options?.method === "PATCH"
        ) {
          writes++;
          expect(response.status).toBe(204);
          throw new TypeError("Injected response loss after real commit");
        }
        return response;
      },
    );
    expect(await run.submit(body())).toBe(false);
    expect(run.snapshot()).toMatchObject({ unknown: true, confirmed: false });
    expect(await run.submit(body())).toBe(false);
    expect(writes).toBe(1);
    await revoked(access, refresh);
    expect(await run.exit()).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("unconfirmed");
    expect(session.snapshot()).toMatchObject({
      user: null,
      status: "anonymous",
    });
    expect(readAccessToken()).toBeNull();
    expect(await readRefreshToken()).toBeNull();
    expect(writes).toBe(1);
    run.dispose();
    session.dispose();
    vi.unstubAllGlobals();
  });
});
