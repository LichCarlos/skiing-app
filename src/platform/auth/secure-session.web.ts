export {
  sessionEpoch,
  assertSessionEpoch,
  SessionChangedError,
  subscribeSessionChange,
  beginSessionChange,
  clearSessionTokens,
  sessionBoundaryMessage,
} from "./browser-session";
// The browser never reads/writes native credentials or HttpOnly cookies.
export function readAccessToken(): null {
  return null;
}
export async function readRefreshToken(): Promise<null> {
  return null;
}
export async function writeSessionTokens(): Promise<never> {
  throw new Error("浏览器认证仅使用 HttpOnly Cookie");
}
