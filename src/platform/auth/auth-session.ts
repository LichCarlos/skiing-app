import type { components } from "../api/openapi";
import { apiRequest, refreshMobileSession } from "../api/api-client";
import {
  assertSessionEpoch,
  beginSessionChange,
  sessionEpoch,
  takeSessionForLogout,
  writeSessionTokens,
} from "./secure-session";

type AuthSession = components["schemas"]["AuthSessionDataVO"];
type CurrentUser = components["schemas"]["CurrentUserVO"];
export interface RegisterInput {
  account: string;
  password: string;
  nickname: string;
}
export interface LoginInput {
  account: string;
  password: string;
}

export function registerAccount(
  input: RegisterInput,
  options: { signal?: AbortSignal } = {},
): Promise<components["schemas"]["RegisteredUserVO"]> {
  return apiRequest("/auth/register", {
    method: "POST",
    body: input,
    ...options,
  });
}
let loginFlight: { epoch: number; promise: Promise<CurrentUser> } | null = null;
export function login(input: LoginInput): Promise<CurrentUser> {
  const change = beginSessionChange();
  const work = (async () => {
    await change.ready;
    assertSessionEpoch(change.epoch);
    const session = await apiRequest<AuthSession>("/auth/login", {
      method: "POST",
      body: input,
      expectedSessionEpoch: change.epoch,
    });
    assertSessionEpoch(change.epoch);
    if (!session.accessToken || !session.refreshToken)
      throw new TypeError("The API did not return mobile session tokens");
    await writeSessionTokens(
      session.accessToken,
      session.refreshToken,
      change.epoch,
    );
    assertSessionEpoch(change.epoch);
    return session.currentUser;
  })();
  const flight = { epoch: change.epoch, promise: work };
  flight.promise = work.finally(() => {
    if (loginFlight === flight) loginFlight = null;
  });
  loginFlight = flight;
  return flight.promise;
}
export async function restoreSession(): Promise<CurrentUser | null> {
  if (loginFlight?.epoch === sessionEpoch()) return loginFlight.promise;
  return (await refreshMobileSession(sessionEpoch()))?.currentUser ?? null;
}
export const refreshSession = restoreSession;

let logoutFlight: { epoch: number; promise: Promise<void> } | null = null;
export function logout(): Promise<void> {
  if (logoutFlight?.epoch === sessionEpoch()) return logoutFlight.promise;
  const change = takeSessionForLogout();
  const flight = { epoch: change.epoch, promise: Promise.resolve() };
  flight.promise = (async () => {
    const credentials = await change.credentials;
    assertSessionEpoch(change.epoch);
    await apiRequest<{ loggedOut: boolean }>("/auth/logout", {
      method: "POST",
      body: credentials.refreshToken
        ? { refreshToken: credentials.refreshToken }
        : {},
      headers: credentials.accessToken
        ? { Authorization: `Bearer ${credentials.accessToken}` }
        : undefined,
      expectedSessionEpoch: change.epoch,
    });
  })().finally(() => {
    if (logoutFlight === flight) logoutFlight = null;
  });
  logoutFlight = flight;
  return flight.promise;
}
