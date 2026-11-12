import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../platform/api/api-error";
import { SettingsRun } from "./settings-run";
const input = {
  currentPassword: " old-pass ",
  newPassword: " new-pass ",
  confirmPassword: " new-pass ",
};
function deferred<T = void>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const ports = {
    verify: vi.fn(async (_signal: AbortSignal): Promise<void> => undefined),
    write: vi.fn(
      async (_body: unknown, _signal: AbortSignal): Promise<void> => undefined,
    ),
    finish: vi.fn(async (_mode: string): Promise<void> => undefined),
    changed: vi.fn(),
  };
  const run = new SettingsRun(ports);
  run.activate();
  return { run, ports };
}
const failure = (status: number) =>
  new ApiError("synthetic failure", { status, code: null, traceId: null });
describe("focused settings password and logout workflow", () => {
  it("writes only generated DTO fields, preserves whitespace and ends session after 204", async () => {
    const { run, ports } = setup();
    expect(await run.submit(input)).toBe(true);
    expect(ports.write).toHaveBeenCalledWith(
      {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      },
      expect.any(AbortSignal),
    );
    expect(ports.finish).toHaveBeenCalledWith("changed");
    expect(run.snapshot()).toMatchObject({
      busy: false,
      confirmed: true,
      unknown: false,
    });
    expect(JSON.stringify(run.snapshot())).not.toContain(input.newPassword);
    expect(await run.submit(input)).toBe(false);
    expect(ports.write).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...input, currentPassword: "" },
    { ...input, newPassword: "short", confirmPassword: "short" },
    {
      ...input,
      newPassword: "雪".repeat(25),
      confirmPassword: "雪".repeat(25),
    },
    {
      ...input,
      newPassword: input.currentPassword,
      confirmPassword: input.currentPassword,
    },
    { ...input, confirmPassword: "different" },
  ])(
    "rejects invalid credentials before reading identity or sending a command %#",
    async (value) => {
      const { run, ports } = setup();
      expect(await run.submit(value)).toBe(false);
      expect(ports.verify).not.toHaveBeenCalled();
      expect(ports.write).not.toHaveBeenCalled();
      expect(Object.keys(run.snapshot().errors).length).toBeGreaterThan(0);
    },
  );
  it("takes the synchronous gate before identity lookup and blocks logout during a write", async () => {
    const { run, ports } = setup(),
      read = deferred();
    ports.verify.mockReturnValue(read.promise);
    const first = run.submit(input);
    expect(await run.submit(input)).toBe(false);
    expect(await run.exit()).toBe(false);
    expect(ports.verify).toHaveBeenCalledTimes(1);
    expect(ports.finish).not.toHaveBeenCalled();
    read.resolve();
    await first;
    expect(ports.write).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 500])(
    "identity failure %s never becomes an attempted or unknown write",
    async (status) => {
      const { run, ports } = setup();
      ports.verify.mockRejectedValue(failure(status));
      expect(await run.submit(input)).toBe(false);
      expect(ports.write).not.toHaveBeenCalled();
      expect(run.snapshot()).toMatchObject({ busy: false, unknown: false });
    },
  );
  it.each([400, 401, 403, 409, 422])(
    "definitive command denial %s permits explicit corrected input",
    async (status) => {
      const { run, ports } = setup();
      ports.write.mockRejectedValueOnce(failure(status));
      expect(await run.submit(input)).toBe(false);
      expect(run.snapshot().unknown).toBe(false);
      expect(ports.finish).not.toHaveBeenCalled();
      expect(await run.submit(input)).toBe(true);
      expect(ports.write).toHaveBeenCalledTimes(2);
    },
  );
  it.each([
    failure(0),
    failure(408),
    failure(500),
    failure(502),
    new Error("body lost"),
  ])(
    "unknown response blocks every subsequent command until exit %#",
    async (error) => {
      const { run, ports } = setup();
      ports.write.mockRejectedValue(error);
      expect(await run.submit(input)).toBe(false);
      expect(run.snapshot().unknown).toBe(true);
      expect(await run.submit(input)).toBe(false);
      expect(ports.write).toHaveBeenCalledTimes(1);
      run.dispose();
      run.activate();
      expect(run.snapshot().unknown).toBe(true);
      expect(await run.submit(input)).toBe(false);
      expect(await run.exit()).toBe(true);
      expect(ports.finish).toHaveBeenCalledWith("unconfirmed");
    },
  );
  it("focus loss during identity lookup cancels and ignores the old callback", async () => {
    const { run, ports } = setup(),
      read = deferred();
    ports.verify.mockReturnValue(read.promise);
    const first = run.submit(input);
    const signal = ports.verify.mock.calls[0]![0];
    run.dispose();
    expect(signal.aborted).toBe(true);
    run.activate();
    read.resolve();
    expect(await first).toBe(false);
    expect(ports.write).not.toHaveBeenCalled();
    expect(run.snapshot().unknown).toBe(false);
  });
  it.each(["resolve", "reject"])(
    "focus loss after sending leaves unknown and discards late %s",
    async (mode) => {
      const { run, ports } = setup(),
        write = deferred();
      ports.write.mockReturnValue(write.promise);
      const first = run.submit(input);
      await vi.waitFor(() => expect(ports.write).toHaveBeenCalledTimes(1));
      run.dispose();
      run.activate();
      const before = ports.changed.mock.calls.length;
      if (mode === "resolve") write.resolve();
      else write.reject(new Error("late"));
      expect(await first).toBe(false);
      expect(ports.changed.mock.calls.length).toBe(before);
      expect(run.snapshot()).toMatchObject({ busy: false, unknown: true });
      expect(ports.finish).not.toHaveBeenCalled();
    },
  );
  it("a confirmed change is never downgraded to unknown by UI cleanup failure", async () => {
    const { run, ports } = setup();
    ports.finish.mockRejectedValue(new Error("UI cleanup failed"));
    expect(await run.submit(input)).toBe(true);
    expect(run.snapshot()).toMatchObject({
      confirmed: true,
      unknown: false,
      busy: false,
    });
    expect(await run.submit(input)).toBe(false);
    await run.exit();
    expect(ports.finish).toHaveBeenCalledTimes(2);
  });
  it("disposal caused by session invalidation does not undo a confirmed result", async () => {
    const { run, ports } = setup();
    ports.finish.mockImplementation(async () => {
      run.dispose();
    });
    expect(await run.submit(input)).toBe(true);
    run.activate();
    expect(run.snapshot()).toMatchObject({
      confirmed: true,
      unknown: false,
      busy: false,
    });
  });
  it("signout has one gate and cannot trigger navigation from the obsolete screen", async () => {
    const { run, ports } = setup(),
      done = deferred();
    ports.finish.mockReturnValue(done.promise);
    const first = run.exit();
    expect(await run.exit()).toBe(false);
    expect(await run.submit(input)).toBe(false);
    expect(ports.finish).toHaveBeenCalledWith("logout");
    run.dispose();
    run.activate();
    const before = ports.changed.mock.calls.length;
    done.resolve();
    await first;
    expect(ports.changed.mock.calls.length).toBe(before);
    expect(run.snapshot().busy).toBe(false);
  });
  it("an inactive screen cannot change credentials or sign out", async () => {
    const { run, ports } = setup();
    run.dispose();
    expect(await run.submit(input)).toBe(false);
    expect(await run.exit()).toBe(false);
    expect(ports.verify).not.toHaveBeenCalled();
    expect(ports.finish).not.toHaveBeenCalled();
  });
});
