import { getApiBaseUrl } from "../config";

interface Marker {
  revision: string;
  blocked: boolean;
  unconfirmed?: boolean;
}
let epoch = 0;
let observed: string | undefined;
let storageFailed = false;
const listeners = new Set<() => void>();
let listening = false;
export class SessionChangedError extends Error {
  constructor() {
    super("登录会话已变化，请重新操作。");
    this.name = "AbortError";
  }
}
const key = () => `linji.expo.session.v1:${getApiBaseUrl()}`;
function browser() {
  if (typeof window === "undefined")
    throw new Error("浏览器会话只能在客户端使用");
  return window;
}
function marker(): Marker {
  const raw = browser().localStorage.getItem(key());
  if (raw === null) return { revision: "initial", blocked: false };
  const value = JSON.parse(raw) as Partial<Marker>;
  if (
    !value ||
    typeof value.revision !== "string" ||
    typeof value.blocked !== "boolean" ||
    (value.unconfirmed !== undefined && typeof value.unconfirmed !== "boolean")
  )
    throw new Error("浏览器会话标记无效，请重新登录");
  return value as Marker;
}
function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* A UI observer cannot retain identity. */
    }
  }
}
function synchronize() {
  let current: Marker;
  try {
    current = marker();
  } catch {
    if (!storageFailed) {
      storageFailed = true;
      epoch++;
      notify();
    }
    return { revision: "unavailable", blocked: true, unconfirmed: true };
  }
  storageFailed = false;
  if (observed === undefined) observed = current.revision;
  else if (observed !== current.revision) {
    observed = current.revision;
    epoch++;
    notify();
  }
  return current;
}
export function sessionEpoch() {
  if (typeof window !== "undefined") synchronize();
  return epoch;
}
export function assertSessionEpoch(expected: number) {
  if (sessionEpoch() !== expected) throw new SessionChangedError();
}
export function subscribeSessionChange(listener: () => void) {
  if (typeof window !== "undefined" && !listening) {
    listening = true;
    window.addEventListener("storage", (event) => {
      if (event.key === key() || event.key === null) {
        synchronize();
      }
    });
    window.addEventListener("pageshow", () => {
      synchronize();
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Only noncredential revision/intent metadata is persisted. */
export function beginSessionChange(unconfirmed = false) {
  let error: unknown;
  try {
    synchronize();
    const revision = browser().crypto.randomUUID();
    browser().localStorage.setItem(
      key(),
      JSON.stringify({ revision, blocked: true, unconfirmed } satisfies Marker),
    );
    observed = revision;
    storageFailed = false;
  } catch (cause) {
    error = cause;
  }
  epoch++;
  notify();
  return { epoch, ready: error ? Promise.reject(error) : Promise.resolve() };
}
export function clearSessionTokens(expected = sessionEpoch()): Promise<void> {
  if (sessionEpoch() !== expected) return Promise.resolve();
  return beginSessionChange().ready;
}
export function browserSessionBlocked() {
  return synchronize().blocked;
}
export function sessionBoundaryMessage(): string | null {
  return synchronize().unconfirmed
    ? "浏览器会话结果尚未确认，当前会话已停用，请重新登录。"
    : null;
}
export function confirmBrowserSession(expected: number) {
  assertSessionEpoch(expected);
  const current = marker();
  browser().localStorage.setItem(
    key(),
    JSON.stringify({ ...current, blocked: false, unconfirmed: false }),
  );
}
export function confirmBrowserLogout(expected: number) {
  assertSessionEpoch(expected);
  browser().localStorage.setItem(
    key(),
    JSON.stringify({ ...marker(), blocked: true, unconfirmed: false }),
  );
}
/** All cookie requests share a lock across tabs of this Expo origin. */
export async function withBrowserSessionLock<T>(
  work: () => Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  const locks = browser().navigator.locks;
  if (!locks)
    return Promise.reject(
      new Error(
        "当前浏览器不支持安全会话协调，请使用支持 Web Locks 的 HTTPS 浏览器",
      ),
    );
  return locks.request(
    `linji.expo.cookie:${getApiBaseUrl()}`,
    { mode: "exclusive", ...(signal ? { signal } : {}) },
    work,
  );
}
