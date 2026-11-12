import * as SecureStore from "expo-secure-store";

const REFRESH_TOKEN_KEY = "linji.refresh-token";
let accessToken: string | null = null;
let epoch = 0;
let storageBlocked = false;
let storageQueue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

export class SessionChangedError extends Error {
  constructor() {
    super("登录会话已变化，请重新操作。");
    this.name = "AbortError";
  }
}
export function sessionEpoch() {
  return epoch;
}
export function sessionBoundaryMessage(): string | null {
  return null;
}
export function assertSessionEpoch(expected: number) {
  if (epoch !== expected) throw new SessionChangedError();
}
export function subscribeSessionChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function advanceSession() {
  epoch++;
  accessToken = null;
  storageBlocked = true;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* A UI observer cannot retain old credentials. */
    }
  }
  return epoch;
}
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(task);
  storageQueue = result.catch(() => undefined);
  return result;
}
export function readAccessToken(): string | null {
  return accessToken;
}
export function readRefreshToken(expected = epoch): Promise<string | null> {
  return enqueue(async () => {
    assertSessionEpoch(expected);
    if (storageBlocked) return null;
    const value = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    assertSessionEpoch(expected);
    return value;
  });
}
export function beginSessionChange() {
  const next = advanceSession();
  const ready = enqueue(async () => {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    if (epoch === next) storageBlocked = false;
  });
  return { epoch: next, ready };
}
export function writeSessionTokens(
  nextAccessToken: string,
  refreshToken: string,
  expected = epoch,
): Promise<void> {
  return enqueue(async () => {
    assertSessionEpoch(expected);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    assertSessionEpoch(expected);
    accessToken = nextAccessToken;
    storageBlocked = false;
  }).catch(async (error: unknown) => {
    if (epoch === expected)
      await clearSessionTokens(expected).catch(() => undefined);
    throw error;
  });
}
export function clearSessionTokens(expected = epoch): Promise<void> {
  if (epoch !== expected) return Promise.resolve();
  return beginSessionChange().ready;
}
/** Invalidate synchronously, then read-and-delete in the same storage queue. */
export function takeSessionForLogout() {
  const previousAccess = accessToken;
  const next = advanceSession();
  const credentials = enqueue(async () => {
    let refreshToken: string | null = null;
    try {
      refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } finally {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      if (epoch === next) storageBlocked = false;
    }
    return { accessToken: previousAccess, refreshToken };
  });
  return { epoch: next, credentials };
}
