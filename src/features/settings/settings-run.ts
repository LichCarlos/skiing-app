import { ApiError } from "../../platform/api/api-error";
import {
  validatePasswordChange,
  type PasswordChangeValues,
  type PasswordChangeErrors,
} from "../../platform/auth/auth-validation";
import type { PasswordChangeBody, SettingsExit } from "./settings-api";

export interface SettingsState {
  busy: boolean;
  unknown: boolean;
  confirmed: boolean;
  message: string | null;
  errors: PasswordChangeErrors;
}
interface Ports {
  verify(signal: AbortSignal): Promise<void>;
  write(body: PasswordChangeBody, signal: AbortSignal): Promise<void>;
  finish(mode: SettingsExit): Promise<void>;
  changed(state: SettingsState): void;
}
export class SettingsRun {
  private lifetime: AbortController | null = null;
  private operation: { attempted: boolean; signal: AbortController } | null =
    null;
  private state: SettingsState = {
    busy: false,
    unknown: false,
    confirmed: false,
    message: null,
    errors: {},
  };
  constructor(private readonly ports: Ports) {}
  activate() {
    if (this.lifetime) return;
    this.lifetime = new AbortController();
    this.update({ busy: false });
  }
  snapshot() {
    return this.state;
  }
  dispose() {
    this.lifetime?.abort();
    this.lifetime = null;
    if (this.operation?.attempted && !this.state.confirmed)
      this.update({
        unknown: true,
        message: "密码修改结果尚未确认，请退出后重新登录核对；不要重复提交。",
      });
    this.operation?.signal.abort();
    this.operation = null;
    this.update({ busy: false, errors: {} });
  }
  private update(patch: Partial<SettingsState>) {
    this.state = { ...this.state, ...patch };
    if (this.lifetime) this.ports.changed(this.state);
  }
  async submit(input: PasswordChangeValues) {
    const lifetime = this.lifetime;
    if (
      !lifetime ||
      this.operation ||
      this.state.unknown ||
      this.state.confirmed
    )
      return false;
    const errors = validatePasswordChange(input);
    this.update({ errors, message: null });
    if (Object.keys(errors).length) return false;
    const operation = { attempted: false, signal: new AbortController() };
    this.operation = operation;
    const current = () =>
      this.lifetime === lifetime &&
      this.operation === operation &&
      !operation.signal.signal.aborted;
    this.update({ busy: true });
    try {
      await this.ports.verify(operation.signal.signal);
      if (!current()) return false;
      operation.attempted = true;
      await this.ports.write(
        {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
        },
        operation.signal.signal,
      );
      if (!current()) return false;
      this.update({
        confirmed: true,
        message: "密码已更新，全部登录会话已撤销，请重新登录。",
      });
      await this.ports.finish("changed");
      return true;
    } catch (error) {
      if (!current()) return false;
      if (this.state.confirmed) {
        this.update({ message: "密码已更新，请退出后重新登录。" });
        return true;
      }
      const definitive =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      const unknown = operation.attempted && !definitive;
      this.update({
        unknown,
        message: unknown
          ? "密码修改结果尚未确认，请退出后重新登录核对；不要重复提交。"
          : error instanceof ApiError && error.status === 401
            ? "当前密码不正确，或登录状态已失效。"
            : error instanceof ApiError && error.status === 403
              ? "账号或改密权限已变化，请重新登录。"
              : "暂时无法修改密码，请检查网络或登录状态后重试。",
      });
      return false;
    } finally {
      if (current()) {
        this.operation = null;
        this.update({ busy: false });
      }
    }
  }
  async exit() {
    if (!this.lifetime || this.operation) return false;
    const operation = { attempted: false, signal: new AbortController() };
    this.operation = operation;
    this.update({ busy: true, errors: {} });
    try {
      await this.ports.finish(
        this.state.unknown
          ? "unconfirmed"
          : this.state.confirmed
            ? "changed"
            : "logout",
      );
      return true;
    } catch {
      if (this.operation === operation)
        this.update({ message: "退出未完成，请重新尝试退出。" });
      return false;
    } finally {
      if (this.operation === operation) {
        this.operation = null;
        this.update({ busy: false });
      }
    }
  }
}
