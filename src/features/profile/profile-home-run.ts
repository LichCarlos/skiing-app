import type { components } from "../../platform/api/openapi";
import type { AuthStatus } from "../../platform/auth/session-controller";
type User = components["schemas"]["CurrentUserVO"];
export const PROFILE_HOME_LINKS = {
  edit: {
    path: "/profile/edit",
    grant: "account:profile:update",
    label: "编辑资料",
  },
  favorites: {
    path: "/profile/favorites",
    grant: "member:favorite:toggle",
    label: "我的收藏",
  },
  dynamics: {
    path: "/profile/dynamics",
    grant: "community:dynamic:read-own",
    label: "我的动态",
  },
  ai: { path: "/ai", grant: "ai:conversation:use", label: "滑雪 AI 助手" },
  settings: { path: "/settings", grant: null, label: "账号设置" },
} as const;
type Target = keyof typeof PROFILE_HOME_LINKS | "auth";
export interface HomeSession {
  user: User | null;
  status: AuthStatus;
  epoch: number;
}
export function homeSessionKey(session: HomeSession) {
  return JSON.stringify([
    session.user?.userId,
    session.user?.account,
    session.status,
    session.epoch,
  ]);
}
export function homeTargetAllowed(target: Target, session: HomeSession) {
  if (target === "auth") return !session.user && session.status === "anonymous";
  if (!session.user || session.status !== "authenticated") return false;
  const grant = PROFILE_HOME_LINKS[target].grant;
  return !grant || session.user.permissionKeys.includes(grant);
}
export interface HomeState {
  active: boolean;
  refreshing: boolean;
  loggingOut: boolean;
  recovering: boolean;
  profileDenied: boolean;
  notice: string | null;
}
interface Ports {
  session(): HomeSession;
  refresh(signal: AbortSignal): Promise<User>;
  signOut(): Promise<void>;
  restore(): Promise<void>;
  navigate(path: string): void;
  changed(state: HomeState): void;
}
export class ProfileHomeRun {
  private readonly expected: string;
  private generation = 0;
  private read: AbortController | null = null;
  private logoutFlight: object | null = null;
  private restoreFlight: object | null = null;
  private navigating = false;
  private state: HomeState = {
    active: false,
    refreshing: false,
    loggingOut: false,
    recovering: false,
    profileDenied: false,
    notice: null,
  };
  constructor(
    expected: HomeSession,
    private readonly ports: Ports,
  ) {
    this.expected = homeSessionKey(expected);
  }
  snapshot() {
    return this.state;
  }
  activate() {
    if (this.state.active) return;
    this.generation++;
    this.navigating = false;
    this.update({ active: true, refreshing: false });
  }
  deactivate() {
    this.generation++;
    this.state = { ...this.state, active: false };
    this.cancelRead();
  }
  private current() {
    return (
      this.state.active &&
      this.expected === homeSessionKey(this.ports.session())
    );
  }
  private idle() {
    return (
      this.current() &&
      !this.logoutFlight &&
      !this.restoreFlight &&
      !this.navigating
    );
  }
  private cancelRead() {
    this.read?.abort();
    this.read = null;
    this.state = { ...this.state, refreshing: false };
  }
  async refresh() {
    if (!this.idle() || this.read) return;
    const { user, status } = this.ports.session();
    if (!user || status !== "authenticated") return;
    const generation = this.generation;
    const controller = new AbortController();
    this.read = controller;
    this.update({ refreshing: true, notice: null });
    const current = () =>
      this.current() &&
      this.read === controller &&
      this.generation === generation &&
      !controller.signal.aborted;
    try {
      const profile = await this.ports.refresh(controller.signal);
      if (!current()) return;
      if (profile.userId !== user.userId || profile.account !== user.account)
        throw new Error("Account changed");
      this.update({ profileDenied: false, notice: null });
    } catch {
      if (current())
        this.update({ profileDenied: true, notice: "资料更新失败，请重试。" });
    } finally {
      if (this.read === controller) {
        this.read = null;
        if (this.current()) this.update({ refreshing: false });
      }
    }
  }
  navigate(target: Target) {
    if (!this.idle() || !homeTargetAllowed(target, this.ports.session()))
      return false;
    this.cancelRead();
    this.navigating = true;
    const path = target === "auth" ? "/auth" : PROFILE_HOME_LINKS[target].path;
    this.ports.navigate(path);
    return true;
  }
  async signOut() {
    if (
      !this.idle() ||
      this.ports.session().status !== "authenticated" ||
      !this.ports.session().user
    )
      return;
    this.cancelRead();
    const flight = {};
    const generation = this.generation;
    this.logoutFlight = flight;
    this.update({ loggingOut: true, notice: null });
    try {
      await this.ports.signOut();
    } catch {
      // The provider owns warnings once logout has invalidated credentials.
      if (this.current() && generation === this.generation)
        this.update({
          notice: "当前会话已停用，设备凭证清理或服务端退出尚未确认。",
        });
    } finally {
      if (this.logoutFlight === flight) {
        this.logoutFlight = null;
        if (this.current()) this.update({ loggingOut: false });
      }
    }
  }
  async retryRestore() {
    if (!this.idle() || !homeTargetAllowed("auth", this.ports.session()))
      return;
    const flight = {};
    const generation = this.generation;
    this.restoreFlight = flight;
    this.update({ recovering: true });
    try {
      await this.ports.restore();
    } catch {
      if (this.current() && generation === this.generation)
        this.update({ notice: "会话恢复失败，可以先以游客身份浏览。" });
    } finally {
      if (this.restoreFlight === flight) {
        this.restoreFlight = null;
        if (this.current()) this.update({ recovering: false });
      }
    }
  }
  private update(patch: Partial<HomeState>) {
    this.state = { ...this.state, ...patch };
    if (this.current()) this.ports.changed(this.state);
  }
}
