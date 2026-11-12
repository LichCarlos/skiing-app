import { ApiError } from "../../platform/api/api-error";
import type { components } from "../../platform/api/openapi";
import type {
  LoginInput,
  RegisterInput,
} from "../../platform/auth/auth-session";
import {
  normalizeAccount,
  validateLogin,
  validateRegistration,
  type AuthFormErrors,
  type AuthFormValues,
} from "../../platform/auth/auth-validation";

export type AuthMode = "login" | "register";
type RegisteredUser = components["schemas"]["RegisteredUserVO"];
export interface AuthFormState {
  active: boolean;
  busy: boolean;
  errors: AuthFormErrors;
  message: string | null;
  success: boolean;
  traceId: string | null;
}
interface Ports {
  signIn(input: LoginInput): Promise<void>;
  register(input: RegisterInput, signal: AbortSignal): Promise<RegisteredUser>;
  epoch(): number;
  restoring(): boolean;
  clearPassword(): void;
  signedIn(): void;
  registered(account: string): void;
  changed(state: AuthFormState): void;
}

/** Page focus owns feedback/navigation; the session provider owns credentials. */
export class AuthFormRun {
  private generation = 0;
  private flight: { mode: AuthMode; controller: AbortController } | null = null;
  private state: AuthFormState;

  constructor(
    private readonly ports: Ports,
    notice?: string,
  ) {
    this.state = {
      active: false,
      busy: false,
      errors: {},
      message:
        notice === "password-changed"
          ? "密码已更新，全部登录会话已退出，请使用新密码登录。"
          : notice === "password-unconfirmed"
            ? "上次密码修改结果尚未确认，请自行核对后登录；应用不会自动尝试密码或重复改密。"
            : null,
      success: notice === "password-changed",
      traceId: null,
    };
  }
  snapshot() {
    return this.state;
  }
  activate() {
    if (this.state.active) return;
    this.generation++;
    this.update({ active: true, busy: !!this.flight });
  }
  deactivate() {
    if (!this.state.active) return;
    this.generation++;
    this.state = {
      ...this.state,
      active: false,
      ...(this.flight?.mode === "register"
        ? { message: failureMessage("register", undefined), success: false }
        : {}),
    };
    if (this.flight?.mode === "register") this.flight.controller.abort();
  }
  canInteract() {
    return this.canNavigate() && !this.ports.restoring();
  }
  canNavigate() {
    return this.state.active && !this.flight;
  }
  clearFeedback() {
    if (!this.canInteract()) return false;
    this.update({ errors: {}, message: null, success: false, traceId: null });
    return true;
  }
  async submit(mode: AuthMode, values: AuthFormValues): Promise<void> {
    if (!this.canInteract()) return;
    const errors =
      mode === "login" ? validateLogin(values) : validateRegistration(values);
    this.update({ errors, message: null, success: false, traceId: null });
    if (Object.keys(errors).length) return;

    const generation = this.generation;
    const flight = { mode, controller: new AbortController() };
    this.flight = flight;
    this.update({ busy: true });
    this.ports.clearPassword();
    let epoch = this.ports.epoch();
    const account = normalizeAccount(values.account);
    const current = () =>
      this.state.active &&
      this.generation === generation &&
      this.flight === flight &&
      this.ports.epoch() === epoch;
    try {
      if (mode === "login") {
        // signIn synchronously advances the storage epoch before its first await.
        const login = this.ports.signIn({ account, password: values.password });
        epoch = this.ports.epoch();
        await login;
        if (current()) this.ports.signedIn();
      } else {
        const registered = await this.ports.register(
          {
            account,
            password: values.password,
            nickname: (values.nickname ?? "").trim(),
          },
          flight.controller.signal,
        );
        if (!current()) return;
        if (
          !registered ||
          !Number.isInteger(registered.userId) ||
          registered.userId < 1 ||
          registered.userId > 2147483647 ||
          registered.account !== account ||
          typeof registered.nickname !== "string" ||
          !registered.nickname.trim()
        )
          throw new TypeError("Invalid registration response");
        this.update({ message: "账号已创建，请登录。", success: true });
        this.ports.registered(account);
      }
    } catch (error) {
      if (!current()) return;
      const fieldErrors: AuthFormErrors = {};
      if (error instanceof ApiError)
        for (const detail of error.details)
          if (["account", "password", "nickname"].includes(detail.field ?? ""))
            fieldErrors[detail.field as keyof AuthFormErrors] = detail.message;
      this.update({
        errors: fieldErrors,
        message: failureMessage(mode, error),
        success: false,
        traceId: error instanceof ApiError ? error.traceId : null,
      });
    } finally {
      if (this.flight === flight) {
        this.flight = null;
        // An old focus can only release its own busy flag, never publish its result.
        this.update({ busy: false });
      }
    }
  }
  private update(patch: Partial<AuthFormState>) {
    this.state = { ...this.state, ...patch };
    if (this.state.active) this.ports.changed(this.state);
  }
}

function failureMessage(mode: AuthMode, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429 && mode === "login")
      return "登录过于频繁，请稍后手动重试。";
    if (error.status === 409 && mode === "register")
      return "该账号已注册，请直接登录。";
    if (error.status === 401 && mode === "login") return "账号或密码不正确。";
    if (error.status >= 400 && error.status < 500 && error.status !== 408)
      return "提交未成功，请检查填写内容或稍后手动重试。";
  }
  if (
    error instanceof Error &&
    error.message.includes("EXPO_PUBLIC_API_BASE_URL")
  )
    return "尚未配置服务地址，请联系项目管理员。";
  return mode === "register"
    ? "创建账号的结果尚未确认，请检查网络后使用该账号尝试登录；应用不会自动重复注册。"
    : "登录结果尚未确认，请检查网络后手动重新登录。";
}
