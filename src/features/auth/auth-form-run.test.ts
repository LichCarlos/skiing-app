import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../platform/api/api-error";
import type { RegisterInput } from "../../platform/auth/auth-session";
import { AuthFormRun } from "./auth-form-run";

const input = {
  account: "  SNOW  ",
  password: " password ",
  nickname: " Snow ",
};
const registered = { userId: 7, account: "snow", nickname: "Snow" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(notice?: string) {
  let epoch = 3;
  let restoring = false;
  const ports = {
    signIn: vi.fn(async (_input: { account: string; password: string }) => {
      epoch++;
    }),
    register: vi.fn(
      async (_input: RegisterInput, _signal: AbortSignal) => registered,
    ),
    epoch: () => epoch,
    restoring: () => restoring,
    clearPassword: vi.fn(),
    signedIn: vi.fn(),
    registered: vi.fn(),
    changed: vi.fn(),
  };
  const run = new AuthFormRun(ports, notice);
  run.activate();
  return {
    run,
    ports,
    boundary: () => epoch++,
    restoring: (value: boolean) => {
      restoring = value;
    },
  };
}
function apiError(
  status: number,
  details: Array<{ field: string; code: string; message: string }> = [],
) {
  return new ApiError("private server detail", {
    status,
    code: status,
    traceId: "test-trace",
    details,
  });
}

describe("authentication form request lifetime", () => {
  it("normalizes the account without trimming the password and accepts the login's own epoch", async () => {
    const { run, ports } = setup();
    await run.submit("login", input);
    expect(ports.signIn).toHaveBeenCalledExactlyOnceWith({
      account: "snow",
      password: " password ",
    });
    expect(ports.clearPassword).toHaveBeenCalledOnce();
    expect(ports.signedIn).toHaveBeenCalledOnce();
    expect(ports.register).not.toHaveBeenCalled();
    expect(run.snapshot().busy).toBe(false);
    expect(JSON.stringify(run.snapshot())).not.toContain("password");
  });
  it("blocks form submission while restoring but keeps guest navigation available", async () => {
    const { run, ports, restoring } = setup();
    run.deactivate();
    await run.submit("login", input);
    expect(run.canInteract()).toBe(false);
    run.activate();
    restoring(true);
    await run.submit("login", input);
    expect(run.canInteract()).toBe(false);
    expect(run.canNavigate()).toBe(true);
    expect(ports.signIn).not.toHaveBeenCalled();
    restoring(false);
    expect(run.canInteract()).toBe(true);
  });
  it("keeps the password for validation corrections without making a request", async () => {
    const { run, ports } = setup();
    await run.submit("register", {
      account: " ",
      password: "雪",
      nickname: " ",
    });
    expect(Object.keys(run.snapshot().errors)).toEqual([
      "account",
      "password",
      "nickname",
    ]);
    expect(ports.clearPassword).not.toHaveBeenCalled();
    expect(ports.register).not.toHaveBeenCalled();
  });
  it("gates duplicate Enter and button submissions synchronously", async () => {
    const { run, ports } = setup();
    const remote = deferred<void>();
    ports.signIn.mockReturnValue(remote.promise);
    const first = run.submit("login", input);
    await run.submit("login", input);
    await run.submit("register", input);
    expect(ports.signIn).toHaveBeenCalledOnce();
    expect(ports.register).not.toHaveBeenCalled();
    expect(run.clearFeedback()).toBe(false);
    expect(run.canInteract()).toBe(false);
    expect(run.canNavigate()).toBe(false);
    remote.resolve();
    await first;
    expect(run.canInteract()).toBe(true);
  });
  it.each(["resolve", "reject"] as const)(
    "does not publish a late login %s after blur",
    async (outcome) => {
      const { run, ports } = setup();
      const remote = deferred<void>();
      ports.signIn.mockReturnValue(remote.promise);
      const work = run.submit("login", input);
      run.deactivate();
      ports.changed.mockClear();
      if (outcome === "resolve") remote.resolve();
      else remote.reject(apiError(401));
      await work;
      expect(ports.signedIn).not.toHaveBeenCalled();
      expect(ports.changed).not.toHaveBeenCalled();
    },
  );
  it.each(["resolve", "reject"] as const)(
    "ignores a stale login %s after a newer session boundary",
    async (outcome) => {
      const { run, ports, boundary } = setup();
      const remote = deferred<void>();
      ports.signIn.mockReturnValue(remote.promise);
      const work = run.submit("login", input);
      boundary();
      if (outcome === "resolve") remote.resolve();
      else remote.reject(apiError(401));
      await work;
      expect(ports.signedIn).not.toHaveBeenCalled();
      expect(run.snapshot()).toMatchObject({
        message: null,
        traceId: null,
        busy: false,
      });
    },
  );
  it("retains an in-flight login lock across refocus without redirecting from the old focus", async () => {
    const { run, ports } = setup();
    const remote = deferred<void>();
    ports.signIn.mockReturnValueOnce(remote.promise);
    const work = run.submit("login", input);
    run.deactivate();
    run.activate();
    expect(run.snapshot().busy).toBe(true);
    await run.submit("login", input);
    expect(ports.signIn).toHaveBeenCalledOnce();
    remote.resolve();
    await work;
    expect(ports.signedIn).not.toHaveBeenCalled();
    expect(run.snapshot().busy).toBe(false);
    await run.submit("login", input);
    expect(ports.signedIn).toHaveBeenCalledOnce();
  });
  it("registers normalized account/nickname, clears the password and never signs in automatically", async () => {
    const { run, ports } = setup();
    await run.submit("register", input);
    expect(ports.register).toHaveBeenCalledExactlyOnceWith(
      { account: "snow", password: " password ", nickname: "Snow" },
      expect.any(AbortSignal),
    );
    expect(ports.clearPassword).toHaveBeenCalledOnce();
    expect(ports.registered).toHaveBeenCalledExactlyOnceWith("snow");
    expect(ports.signIn).not.toHaveBeenCalled();
    expect(ports.signedIn).not.toHaveBeenCalled();
    expect(run.snapshot()).toMatchObject({
      message: "账号已创建，请登录。",
      success: true,
      busy: false,
    });
  });
  it.each(["resolve", "reject"] as const)(
    "aborts registration on blur and suppresses late %s even after refocus",
    async (outcome) => {
      const { run, ports } = setup();
      const remote = deferred<typeof registered>();
      ports.register.mockReturnValue(remote.promise);
      const work = run.submit("register", input);
      const signal = ports.register.mock.calls[0]![1];
      run.deactivate();
      expect(signal.aborted).toBe(true);
      run.activate();
      expect(run.snapshot().message).toContain("结果尚未确认");
      if (outcome === "resolve") remote.resolve(registered);
      else remote.reject(apiError(409));
      await work;
      expect(ports.registered).not.toHaveBeenCalled();
      expect(run.snapshot()).toMatchObject({ success: false, busy: false });
      expect(run.snapshot().message).toContain("结果尚未确认");
    },
  );
  it("does not accept registration from an earlier session epoch", async () => {
    const { run, ports, boundary } = setup();
    const remote = deferred<typeof registered>();
    ports.register.mockReturnValue(remote.promise);
    const work = run.submit("register", input);
    boundary();
    remote.resolve(registered);
    await work;
    expect(ports.registered).not.toHaveBeenCalled();
    expect(run.snapshot().success).toBe(false);
  });
  it.each([
    null,
    { ...registered, userId: 0 },
    { ...registered, userId: 2147483648 },
    { ...registered, userId: 1.5 },
    { ...registered, account: "other" },
    { ...registered, nickname: " " },
    { ...registered, nickname: null },
  ])(
    "does not confirm malformed or mismatched registration response %#",
    async (response) => {
      const { run, ports } = setup();
      ports.register.mockResolvedValue(response as typeof registered);
      await run.submit("register", input);
      expect(ports.registered).not.toHaveBeenCalled();
      expect(run.snapshot().message).toContain("结果尚未确认");
      expect(run.snapshot().success).toBe(false);
    },
  );
  it.each([0, 408, 500, 503])(
    "keeps an unknown registration result explicit without replay on status %i",
    async (status) => {
      const { run, ports } = setup();
      ports.register.mockRejectedValue(apiError(status));
      await run.submit("register", input);
      expect(ports.register).toHaveBeenCalledOnce();
      expect(ports.registered).not.toHaveBeenCalled();
      expect(run.snapshot()).toMatchObject({
        traceId: "test-trace",
        busy: false,
      });
      expect(run.snapshot().message).toContain("结果尚未确认");
      expect(run.snapshot().message).not.toContain("private server detail");
    },
  );
  it.each([
    ["login", 401, "账号或密码不正确"],
    ["login", 429, "登录过于频繁"],
    ["register", 409, "账号已注册"],
    ["register", 429, "手动重试"],
  ] as const)(
    "classifies a known %s refusal %i",
    async (mode, status, message) => {
      const { run, ports } = setup();
      ports.signIn.mockRejectedValue(apiError(status));
      ports.register.mockRejectedValue(apiError(status));
      await run.submit(mode, input);
      expect(
        mode === "login" ? ports.signIn : ports.register,
      ).toHaveBeenCalledOnce();
      expect(run.snapshot().message).toContain(message);
      expect(run.snapshot().traceId).toBe("test-trace");
    },
  );
  it("only accepts validation details for known form fields", async () => {
    const { run, ports } = setup();
    ports.register.mockRejectedValue(
      apiError(400, [
        { field: "nickname", code: "invalid", message: "昵称不符合规则" },
        {
          field: "unrelated",
          code: "invalid",
          message: "private server detail",
        },
      ]),
    );
    await run.submit("register", input);
    expect(run.snapshot().errors).toEqual({ nickname: "昵称不符合规则" });
  });
  it("allows mode changes only when idle and clears previous feedback", async () => {
    const { run } = setup("password-unconfirmed");
    expect(run.snapshot().message).toContain("尚未确认");
    expect(run.clearFeedback()).toBe(true);
    expect(run.snapshot()).toMatchObject({
      message: null,
      errors: {},
      traceId: null,
      success: false,
    });
    run.deactivate();
    expect(run.clearFeedback()).toBe(false);
  });
  it("preserves the confirmed password-change notice", () => {
    expect(setup("password-changed").run.snapshot()).toMatchObject({
      success: true,
    });
    expect(setup("password-changed").run.snapshot().message).toContain(
      "全部登录会话已退出",
    );
  });
});
