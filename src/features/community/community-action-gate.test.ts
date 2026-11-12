import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../platform/api/api-error";
import { CommunityActionGate } from "./community-action-gate";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(userId: number | null = 7) {
  const verify = vi.fn(async () => ({ userId: 7 }));
  const onBusy = vi.fn();
  const gate = new CommunityActionGate(userId, verify, onBusy);
  gate.activate();
  return { gate, verify, onBusy };
}
describe("Mounted community account action serialization", () => {
  it("remembers an attempted write across blur and blocks a second submission until review", async () => {
    const { gate } = setup();
    const response = deferred<number>();
    const write = vi.fn(() => response.promise);
    const first = gate.run(write, vi.fn());
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    gate.dispose();
    gate.activate();
    expect(gate.needsReview()).toBe(true);
    expect(await gate.run(write, vi.fn())).toEqual({ status: "ignored" });
    response.resolve(1);
    expect(await first).toEqual({ status: "ignored" });
    gate.acknowledgeReview();
    expect(await gate.run(async () => 2, vi.fn())).toMatchObject({
      status: "success",
      value: 2,
    });
  });
  it("does not treat failed preparation as an attempted command", async () => {
    const { gate } = setup();
    expect(
      await gate.run(
        async () => {
          throw new Error("read offline");
        },
        vi.fn(),
        true,
      ),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(gate.needsReview()).toBe(false);
  });
  it("blocks a malformed command response after the explicit attempt boundary", async () => {
    const { gate } = setup();
    expect(
      await gate.run(
        async (_signal, attempted) => {
          attempted();
          throw new TypeError("invalid success");
        },
        vi.fn(),
        true,
      ),
    ).toMatchObject({ status: "error", uncertain: true });
    expect(gate.needsReview()).toBe(true);
  });
  it("does not publish a confirmed write into another session after verification", async () => {
    let current = true;
    const committed = vi.fn();
    const gate = new CommunityActionGate(
      7,
      async () => ({ userId: 7 }),
      vi.fn(),
      () => {
        if (!current) throw new Error("session changed");
      },
    );
    gate.activate();
    expect(
      await gate.run(async () => {
        current = false;
        return 9;
      }, committed),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(committed).not.toHaveBeenCalled();
  });
  it("holds a synchronous lock across identity, write and cache reconciliation", async () => {
    const { gate, verify, onBusy } = setup();
    const identity = deferred<{ userId: number }>();
    const reconciled = deferred<void>();
    verify.mockReturnValueOnce(identity.promise);
    const write = vi.fn(async () => ({ commentId: 9 }));
    const committed = vi.fn(() => reconciled.promise);
    const first = gate.run(write, committed);
    expect(await gate.run(write, committed)).toEqual({ status: "ignored" });
    expect(write).not.toHaveBeenCalled();
    identity.resolve({ userId: 7 });
    await vi.waitFor(() => expect(committed).toHaveBeenCalledTimes(1));
    expect(await gate.run(write, committed)).toEqual({ status: "ignored" });
    reconciled.resolve();
    expect(await first).toEqual({ status: "success", value: { commentId: 9 } });
    expect(write).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
  });
  it("does not send or reconcile a write after an account switch during identity lookup", async () => {
    const { gate, verify } = setup();
    const identity = deferred<{ userId: number }>();
    verify.mockReturnValueOnce(identity.promise);
    const write = vi.fn(),
      committed = vi.fn();
    const pending = gate.run(write, committed);
    gate.dispose();
    identity.resolve({ userId: 7 });
    expect(await pending).toEqual({ status: "ignored" });
    expect(write).not.toHaveBeenCalled();
    expect(committed).not.toHaveBeenCalled();
  });
  it("aborts a pending request and discards a late committed response from the old account", async () => {
    const { gate } = setup();
    const response = deferred<number>();
    let signal: AbortSignal | undefined;
    const write = vi.fn((received: AbortSignal) => {
      signal = received;
      return response.promise;
    });
    const committed = vi.fn();
    const pending = gate.run(write, committed);
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    gate.dispose();
    expect(signal?.aborted).toBe(true);
    response.resolve(9);
    expect(await pending).toEqual({ status: "ignored" });
    expect(committed).not.toHaveBeenCalled();
  });
  it("does not issue writes for guests or another verified account", async () => {
    const guest = setup(null),
      changed = setup(8);
    const write = vi.fn(),
      committed = vi.fn();
    expect(await guest.gate.run(write, committed)).toMatchObject({
      status: "error",
      uncertain: false,
    });
    expect(guest.verify).not.toHaveBeenCalled();
    expect(await changed.gate.run(write, committed)).toMatchObject({
      status: "error",
      uncertain: false,
      message: expect.stringContaining("账号"),
    });
    expect(write).not.toHaveBeenCalled();
  });
  it("blocks unknown write results until an explicit review and never retries the request itself", async () => {
    const { gate } = setup();
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(9);
    const committed = vi.fn();
    expect(await gate.run(write, committed)).toMatchObject({
      status: "error",
      uncertain: true,
    });
    expect(await gate.run(write, committed)).toEqual({ status: "ignored" });
    expect(write).toHaveBeenCalledTimes(1);
    expect(committed).not.toHaveBeenCalled();
    gate.acknowledgeReview();
    expect(await gate.run(write, committed)).toEqual({
      status: "success",
      value: 9,
    });
    expect(write).toHaveBeenCalledTimes(2);
  });
  it("identity failure is safe to retry because no write has started", async () => {
    const { gate, verify } = setup();
    verify.mockRejectedValueOnce(new Error("offline"));
    const write = vi.fn(async () => 9),
      committed = vi.fn();
    expect(await gate.run(write, committed)).toMatchObject({
      status: "error",
      uncertain: false,
    });
    expect(write).not.toHaveBeenCalled();
    expect(await gate.run(write, committed)).toMatchObject({
      status: "success",
    });
  });
  it("does not call a known successful write uncertain when the refresh callback fails", async () => {
    const { gate } = setup();
    expect(
      await gate.run(
        async () => 9,
        async () => {
          throw new Error("refresh failed");
        },
      ),
    ).toMatchObject({
      status: "error",
      uncertain: false,
      reviewRequired: true,
    });
    expect(gate.needsReview()).toBe(true);
    expect(await gate.run(async () => 10, vi.fn())).toEqual({
      status: "ignored",
    });
  });
  it("does not let an earlier lifecycle release a newer lifecycle's lock", async () => {
    const { gate, verify } = setup();
    const old = deferred<{ userId: number }>(),
      current = deferred<{ userId: number }>();
    verify
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const write = vi.fn(async () => 9),
      committed = vi.fn();
    const first = gate.run(write, committed);
    gate.dispose();
    gate.activate();
    const second = gate.run(write, committed);
    old.resolve({ userId: 7 });
    expect(await first).toEqual({ status: "ignored" });
    expect(await gate.run(write, committed)).toEqual({ status: "ignored" });
    current.resolve({ userId: 7 });
    expect(await second).toMatchObject({ status: "success" });
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("requires review after blurring during reconciliation of a confirmed write", async () => {
    const { gate } = setup();
    const page = deferred<void>();
    const committed = vi.fn(() => page.promise);
    const first = gate.run(async () => 9, committed);
    await vi.waitFor(() => expect(committed).toHaveBeenCalledOnce());
    gate.dispose();
    gate.activate();
    expect(gate.needsReview()).toBe(true);
    expect(await gate.run(async () => 10, vi.fn())).toEqual({
      status: "ignored",
    });
    page.resolve();
    expect(await first).toEqual({ status: "ignored" });
    expect(gate.needsReview()).toBe(true);
  });
  it.each([400, 401, 403, 409])(
    "keeps definitive HTTP %s rejection retryable without automatic writes",
    async (status) => {
      const { gate } = setup();
      const write = vi
        .fn()
        .mockRejectedValueOnce(
          new ApiError("rejected", { status, code: status, traceId: "t" }),
        )
        .mockResolvedValueOnce(9);
      expect(await gate.run(write, vi.fn())).toMatchObject({
        status: "error",
        uncertain: false,
      });
      expect(await gate.run(write, vi.fn())).toMatchObject({
        status: "success",
      });
      expect(write).toHaveBeenCalledTimes(2);
    },
  );
  it.each([0, 408, 500])(
    "blocks potentially committed HTTP %s results pending review",
    async (status) => {
      const { gate } = setup();
      const write = vi
        .fn()
        .mockRejectedValue(
          new ApiError("unconfirmed", { status, code: null, traceId: "t" }),
        );
      expect(await gate.run(write, vi.fn())).toMatchObject({
        status: "error",
        uncertain: true,
      });
      expect(await gate.run(write, vi.fn())).toEqual({ status: "ignored" });
      expect(write).toHaveBeenCalledTimes(1);
    },
  );
});
