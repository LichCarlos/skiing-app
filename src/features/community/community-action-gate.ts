import { ApiError } from "../../platform/api/api-error";

export type CommunityActionResult<T> =
  | { status: "success"; value: T }
  | { status: "ignored" }
  | {
      status: "error";
      uncertain: boolean;
      reviewRequired?: boolean;
      message: string;
    };

/** One mounted account owns each gate; it never retries a write. */
export class CommunityActionGate {
  private active = false;
  private busy = false;
  private blocked = false;
  private pending: { attempted: boolean; confirmed: boolean } | null = null;
  private controller = new AbortController();
  constructor(
    private readonly userId: number | null,
    private readonly verify: (
      signal: AbortSignal,
    ) => Promise<{ userId: number }>,
    private readonly onBusy: (busy: boolean) => void,
    private readonly check?: (signal: AbortSignal) => void,
  ) {}
  activate() {
    this.active = true;
    if (this.controller.signal.aborted) {
      this.controller = new AbortController();
      this.busy = false;
      this.onBusy(false);
    }
  }
  dispose() {
    // The server may be confirmed while the page has not reconciled yet.
    if (this.pending?.attempted) this.blocked = true;
    this.pending = null;
    this.active = false;
    this.controller.abort();
  }
  needsReview() {
    return this.blocked;
  }
  isActive() {
    return this.active && !this.controller.signal.aborted;
  }
  acknowledgeReview() {
    if (this.isActive() && !this.busy) this.blocked = false;
  }
  async run<T>(
    write: (signal: AbortSignal, attempted: () => void) => Promise<T>,
    committed: (value: T) => Promise<void> | void,
    tracksAttempt = false,
  ): Promise<CommunityActionResult<T>> {
    if (!this.isActive() || this.busy || this.blocked)
      return { status: "ignored" };
    if (this.userId === null)
      return { status: "error", uncertain: false, message: "请先登录" };
    this.busy = true;
    this.onBusy(true);
    let attempted = false;
    let confirmed = false;
    const pending = { attempted: false, confirmed: false };
    this.pending = pending;
    const controller = this.controller;
    const current = () => this.isActive() && controller === this.controller;
    try {
      this.check?.(controller.signal);
      const me = await this.verify(controller.signal);
      if (!current()) return { status: "ignored" };
      this.check?.(controller.signal);
      if (me.userId !== this.userId)
        return {
          status: "error",
          uncertain: false,
          message: "登录账号已变化，请重新打开动态",
        };
      const markAttempted = () => {
        this.check?.(controller.signal);
        controller.signal.throwIfAborted();
        attempted = true;
        pending.attempted = true;
      };
      if (!tracksAttempt) markAttempted();
      const value = await write(controller.signal, markAttempted);
      if (!current()) return { status: "ignored" };
      attempted = false;
      confirmed = true;
      pending.confirmed = true;
      this.check?.(controller.signal);
      if (this.check) {
        const meAfter = await this.verify(controller.signal);
        if (!current()) return { status: "ignored" };
        this.check(controller.signal);
        if (meAfter.userId !== this.userId) throw new Error("社区账号已变化");
      }
      await committed(value);
      return current() ? { status: "success", value } : { status: "ignored" };
    } catch (cause) {
      if (!current()) return { status: "ignored" };
      const definitive =
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408;
      const uncertain = attempted && !definitive;
      if (uncertain || confirmed) this.blocked = true;
      return {
        status: "error",
        uncertain,
        ...(confirmed ? { reviewRequired: true } : {}),
        message: uncertain
          ? "操作结果尚未确认，请先刷新核对，避免重复提交评论。"
          : confirmed
            ? "操作已完成，但页面刷新失败，请刷新后查看。"
            : attempted
              ? "操作未完成，请检查权限或内容后重试。"
              : "无法核对账号或刷新结果，请稍后重试。",
      };
    } finally {
      if (controller === this.controller) {
        this.pending = null;
        this.busy = false;
        if (current()) this.onBusy(false);
      }
    }
  }
}
