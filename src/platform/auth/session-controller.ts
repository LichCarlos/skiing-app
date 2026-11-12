import { ApiError } from "../api/api-error";
import type { components } from "../api/openapi";
import type { LoginInput } from "./auth-session";
import { mergeOwnProfile } from "./apply-profile";
import { assertCurrentUser } from "./current-user-validation";

type CurrentUser = components["schemas"]["CurrentUserVO"];
export type AuthStatus = "restoring" | "anonymous" | "authenticated";
export interface SessionState {
  user: CurrentUser | null;
  status: AuthStatus;
  restoreError: string | null;
}
interface Ports {
  login: (input: LoginInput) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  restore: () => Promise<CurrentUser | null>;
  profile: (signal?: AbortSignal) => Promise<CurrentUser>;
  subscribe: (listener: () => void) => () => void;
  boundaryMessage?: () => string | null;
  changed: (state: SessionState) => void;
}
/** UI ownership is separate from the storage epoch and refresh single-flight. */
export class SessionController {
  private active = false;
  private revision = 0;
  private profileRevision = 0;
  private identityWrite: object | null = null;
  private unsubscribe: (() => void) | null = null;
  private state: SessionState = {
    user: null,
    status: "restoring",
    restoreError: null,
  };
  constructor(private readonly ports: Ports) {}
  snapshot() {
    return this.state;
  }
  activate() {
    if (this.active) return;
    this.active = true;
    this.unsubscribe = this.ports.subscribe(() => {
      this.revision++;
      this.update({
        user: null,
        status: "anonymous",
        restoreError: this.ports.boundaryMessage?.() ?? null,
      });
    });
    this.ports.changed(this.state);
  }
  dispose() {
    this.active = false;
    this.revision++;
    this.identityWrite = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
  clearRestoreError() {
    this.update({ ...this.state, restoreError: null });
  }
  applyProfile(profile: components["schemas"]["UserProfileVO"]) {
    if (
      this.active &&
      this.state.user?.userId === profile.userId &&
      this.state.user.account === profile.account
    ) {
      this.profileRevision++;
      this.update({
        ...this.state,
        user: mergeOwnProfile(this.state.user, profile),
      });
    }
  }
  async signIn(input: LoginInput) {
    if (!this.active) throw superseded();
    const identityWrite = {};
    this.identityWrite = identityWrite;
    // login synchronously invalidates credentials before its first await.
    const work = this.ports.login(input);
    const revision = ++this.revision;
    this.update({ user: null, status: "anonymous", restoreError: null });
    try {
      const user = await work;
      if (!this.current(revision)) throw superseded();
      this.update({ user, status: "authenticated", restoreError: null });
    } finally {
      if (this.identityWrite === identityWrite) this.identityWrite = null;
    }
  }
  async signOut(expected?: Pick<CurrentUser, "userId" | "account">) {
    if (!this.active) throw superseded();
    if (
      expected &&
      (this.state.user?.userId !== expected.userId ||
        this.state.user.account !== expected.account)
    )
      throw superseded();
    const identityWrite = {};
    this.identityWrite = identityWrite;
    const work = this.ports.logout();
    const revision = ++this.revision;
    // Also safe for adapters that fail before notifying the storage boundary.
    this.update({ user: null, status: "anonymous", restoreError: null });
    try {
      await work;
    } catch (error) {
      if (this.current(revision))
        this.update({
          ...this.state,
          restoreError: "当前会话已停用，设备凭证清理或服务端退出尚未确认。",
        });
      throw error;
    } finally {
      if (this.identityWrite === identityWrite) this.identityWrite = null;
    }
    if (!this.current(revision)) throw superseded();
  }
  async restore() {
    if (!this.active || this.identityWrite) return;
    this.update({ user: null, status: "restoring", restoreError: null });
    const work = this.ports.restore();
    const revision = ++this.revision;
    try {
      const user = await work;
      if (this.current(revision))
        this.update({
          user,
          status: user ? "authenticated" : "anonymous",
          restoreError: null,
        });
    } catch (error) {
      if (this.current(revision))
        this.update({
          user: null,
          status: "anonymous",
          restoreError: this.ports.boundaryMessage?.() ?? restoreMessage(error),
        });
    }
  }
  async refreshProfile(signal?: AbortSignal) {
    const userId = this.state.user?.userId;
    const account = this.state.user?.account;
    const revision = this.revision;
    if (!this.active || this.identityWrite || !userId) throw superseded();
    signal?.throwIfAborted();
    const profileRevision = ++this.profileRevision;
    const profile = await this.ports.profile(signal);
    signal?.throwIfAborted();
    if (!this.current(revision) || profileRevision !== this.profileRevision)
      throw superseded();
    assertCurrentUser(profile);
    if (profile.userId !== userId || profile.account !== account)
      throw superseded();
    this.update({ user: profile, status: "authenticated", restoreError: null });
    return profile;
  }
  private current(revision: number) {
    return this.active && revision === this.revision;
  }
  private update(state: SessionState) {
    this.state = state;
    if (this.active) this.ports.changed(state);
  }
}
function superseded() {
  const error = new Error("登录会话已变化，请重新操作。");
  error.name = "AbortError";
  return error;
}
function restoreMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 0)
    return "暂时无法连接服务，请检查网络后重试。";
  if (
    error instanceof Error &&
    error.message.includes("EXPO_PUBLIC_API_BASE_URL")
  )
    return "尚未配置服务地址，请联系项目管理员。";
  return "会话恢复失败，可以先以游客身份浏览或稍后重试。";
}
