import type { components } from "../api/openapi";
import {
  apiRequest,
  restoreBrowserSession,
  validateBrowserSession,
} from "../api/api-client.web";
import {
  assertSessionEpoch,
  beginSessionChange,
  sessionEpoch,
} from "./browser-session";
export interface RegisterInput {
  account: string;
  password: string;
  nickname: string;
}
export interface LoginInput {
  account: string;
  password: string;
}
type User = components["schemas"]["CurrentUserVO"];
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
let loginFlight: { epoch: number; promise: Promise<User> } | null = null;
export function login(input: LoginInput): Promise<User> {
  const change = beginSessionChange(true);
  const work = (async () => {
    await change.ready;
    assertSessionEpoch(change.epoch);
    const session = await apiRequest<unknown>("/auth/login", {
      method: "POST",
      body: input,
      expectedSessionEpoch: change.epoch,
    });
    assertSessionEpoch(change.epoch);
    validateBrowserSession(session);
    return session.currentUser;
  })();
  const flight = { epoch: change.epoch, promise: work };
  flight.promise = work.finally(() => {
    if (loginFlight === flight) loginFlight = null;
  });
  loginFlight = flight;
  return flight.promise;
}
export function restoreSession(): Promise<User | null> {
  if (loginFlight?.epoch === sessionEpoch()) return loginFlight.promise;
  return restoreBrowserSession(sessionEpoch());
}
export const refreshSession = restoreSession;
let logoutFlight: { epoch: number; promise: Promise<void> } | null = null;
export function logout(): Promise<void> {
  if (logoutFlight?.epoch === sessionEpoch()) return logoutFlight.promise;
  const change = beginSessionChange(true);
  const work = (async () => {
    await change.ready;
    assertSessionEpoch(change.epoch);
    const result = await apiRequest<{ loggedOut: boolean }>("/auth/logout", {
      method: "POST",
      body: {},
      expectedSessionEpoch: change.epoch,
    });
    if (result?.loggedOut !== true) throw new TypeError("退出结果尚未确认");
  })();
  const flight = { epoch: change.epoch, promise: work };
  flight.promise = work.finally(() => {
    if (logoutFlight === flight) logoutFlight = null;
  });
  logoutFlight = flight;
  return flight.promise;
}
