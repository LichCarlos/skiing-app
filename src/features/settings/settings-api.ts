import { apiRequest } from "../../platform/api/api-client";
import { ApiError } from "../../platform/api/api-error";
import type { components } from "../../platform/api/openapi";
import {
  clearSessionTokens,
  sessionEpoch,
} from "../../platform/auth/secure-session";

export type PasswordChangeBody = components["schemas"]["ChangeOwnPasswordDto"];
export async function verifySettingsAccount(
  userId: number,
  expectedEpoch: number,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const user = await apiRequest<components["schemas"]["CurrentUserVO"]>(
    "/auth/me",
    {
      signal,
      cache: "no-store",
      expectedSessionEpoch: expectedEpoch,
    },
  );
  signal.throwIfAborted();
  if (
    user.userId !== userId ||
    !user.permissionKeys.includes("account:password:update")
  )
    throw new ApiError("账号或改密权限已变化，请重新登录。", {
      status: 403,
      code: null,
      traceId: null,
    });
}
export function changeOwnPassword(
  body: PasswordChangeBody,
  expectedEpoch: number,
  signal: AbortSignal,
) {
  return apiRequest<void>("/account/password", {
    method: "PATCH",
    body,
    signal,
    skipAuthRefresh: true,
    expectedSessionEpoch: expectedEpoch,
  });
}
export type SettingsExit = "changed" | "unconfirmed" | "logout";
/** The captured credential epoch, rather than a mounted screen, owns cleanup. */
export async function finishSettingsSession(
  mode: SettingsExit,
  expectedEpoch: number,
  ports: { logout(): Promise<void>; navigate(mode: SettingsExit): void },
) {
  if (sessionEpoch() !== expectedEpoch) return;
  const work =
    mode === "changed" ? clearSessionTokens(expectedEpoch) : ports.logout();
  const settled = work.catch(() => undefined);
  // Both cleanup adapters synchronously invalidate the old credentials once.
  // A newer login/logout must never be navigated away by an old completion.
  if (sessionEpoch() === expectedEpoch + 1) ports.navigate(mode);
  // The existing session provider retains a failed logout warning. Failed local
  // deletion keeps SecureStore blocked; a new login must first delete it again.
  await settled;
}
