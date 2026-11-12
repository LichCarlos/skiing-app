import { ApiError } from "../../platform/api/api-error";
import { assertFavoriteTarget, type FavoriteTarget } from "./favorites-api";
import { FavoriteRecoveryLedger } from "./favorite-recovery";

export interface FavoriteState {
  readonly busy: boolean;
  readonly pending: Readonly<FavoriteTarget> | null;
  readonly needsReview: boolean;
  readonly notice: string | null;
}
interface Ports {
  verify(signal: AbortSignal): Promise<void>;
  prepare(signal: AbortSignal): Promise<void>;
  read(target: FavoriteTarget, signal: AbortSignal): Promise<boolean>;
  write(
    target: FavoriteTarget,
    desired: boolean,
    signal: AbortSignal,
  ): Promise<void>;
  reconciled(target: FavoriteTarget, actual: boolean): void;
  changed(state: FavoriteState): void;
}
interface Operation {
  controller: AbortController;
  target: Readonly<FavoriteTarget>;
  attempted: boolean;
  confirmed: boolean;
}
/** One focused account; desired state is explicit, never toggled optimistically. */
export class FavoriteRun {
  private lifetime: AbortController | null = null;
  private operation: Operation | null = null;
  private revision = 0;
  private unsubscribe: (() => void) | null = null;
  private state: FavoriteState = {
    busy: false,
    pending: null,
    needsReview: false,
    notice: null,
  };
  constructor(
    private readonly ports: Ports,
    private readonly ledger = new FavoriteRecoveryLedger(),
  ) {}
  snapshot() {
    return this.state;
  }
  private update(patch: Partial<FavoriteState>) {
    this.state = { ...this.state, ...patch };
    this.synchronize();
  }
  private synchronize() {
    const shared = this.ledger.snapshot();
    this.state = {
      ...this.state,
      busy: !!this.operation || shared.busy,
      needsReview: shared.pending !== null,
      pending: shared.pending?.target ?? this.operation?.target ?? null,
      ...(this.state.needsReview && !shared.pending ? { notice: null } : {}),
      ...(shared.pending && !this.state.notice
        ? {
            notice: shared.pending.confirmed
              ? "收藏操作已确认，请先核对最新状态。"
              : "上次收藏结果尚未确认，请先核对。",
          }
        : {}),
    };
    if (this.lifetime) this.ports.changed(this.state);
  }
  activate() {
    if (this.lifetime) return;
    this.lifetime = new AbortController();
    this.unsubscribe = this.ledger.subscribe(() => this.synchronize());
    this.update({ busy: false });
  }
  dispose() {
    const lifetime = this.lifetime;
    this.lifetime = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    const operation = this.operation;
    this.operation = null;
    this.revision++;
    if (operation?.attempted)
      this.update({
        pending: operation.target,
        needsReview: true,
        notice: operation.confirmed
          ? "收藏操作已确认，返回后请刷新核对最新状态。"
          : "收藏结果尚未确认，返回后请先核对。",
      });
    this.state = { ...this.state, busy: false };
    lifetime?.abort();
    operation?.controller.abort();
  }
  async read<T>(
    signal: AbortSignal,
    fetch: (signal: AbortSignal) => Promise<T>,
  ) {
    const lifetime = this.lifetime;
    if (!lifetime || this.operation || this.ledger.snapshot().busy)
      throw new DOMException("Screen inactive or writing", "AbortError");
    const revision = this.revision,
      sharedRevision = this.ledger.version;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    lifetime.signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted || lifetime.signal.aborted) controller.abort();
    try {
      controller.signal.throwIfAborted();
      await this.ports.verify(controller.signal);
      controller.signal.throwIfAborted();
      const result = await fetch(controller.signal);
      controller.signal.throwIfAborted();
      await this.ports.verify(controller.signal);
      controller.signal.throwIfAborted();
      if (
        this.lifetime !== lifetime ||
        this.revision !== revision ||
        sharedRevision !== this.ledger.version
      )
        throw new DOMException("Superseded read", "AbortError");
      return result;
    } finally {
      signal.removeEventListener("abort", abort);
      lifetime.signal.removeEventListener("abort", abort);
    }
  }
  set(target: FavoriteTarget, desired: boolean) {
    assertFavoriteTarget(target);
    if (this.ledger.snapshot().pending) return Promise.resolve(false);
    return this.execute(target, desired);
  }
  review() {
    const target = this.ledger.snapshot().pending?.target;
    return target ? this.execute(target) : Promise.resolve(false);
  }
  private async execute(input: FavoriteTarget, desired?: boolean) {
    const lifetime = this.lifetime;
    if (!lifetime || this.operation) return false;
    const target = Object.freeze({
      targetType: input.targetType,
      targetId: input.targetId,
    });
    const lease = this.ledger.begin(target, desired === undefined);
    if (!lease) return false;
    let resolved = false;
    const operation: Operation = {
      target,
      controller: new AbortController(),
      attempted: false,
      confirmed: false,
    };
    this.operation = operation;
    this.revision++;
    const signal = operation.controller.signal;
    const current = () =>
      this.lifetime === lifetime &&
      this.operation === operation &&
      !signal.aborted;
    const check = () => {
      if (!current()) throw new DOMException("Screen inactive", "AbortError");
    };
    this.update({ busy: true, pending: target, notice: null });
    try {
      await this.ports.prepare(signal);
      check();
      await this.ports.verify(signal);
      check();
      const previous = await this.ports.read(target, signal);
      check();
      await this.ports.verify(signal);
      check();
      let actual = previous;
      let notice: string | null = null;
      if (desired !== undefined && previous !== desired) {
        operation.attempted = true;
        lease.attempted();
        try {
          await this.ports.write(target, desired, signal);
          operation.confirmed = true;
          lease.confirmed();
        } catch (error) {
          check();
          if (
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 408
          ) {
            operation.attempted = false;
            lease.rejected();
            throw error;
          }
          notice = "请求未正常结束，已重新核对实际收藏状态。";
        }
        check();
        // Do not retry: even a lost response may already have committed.
        actual = await this.ports.read(target, signal);
        check();
        await this.ports.verify(signal);
        check();
        if (actual !== desired)
          notice = "最新收藏状态与本次目标不同，可能已被其他操作更新，请核对。";
      }
      this.ports.reconciled(target, actual);
      resolved = true;
      lease.finish(true);
      this.update({ pending: null, needsReview: false, notice });
      return true;
    } catch (error) {
      if (!current()) return false;
      const unresolved =
        this.ledger.snapshot().pending !== null || operation.attempted;
      this.update({
        pending: unresolved ? target : null,
        needsReview: unresolved,
        notice: unresolved
          ? operation.confirmed
            ? "服务端已确认收藏操作，但最新状态读取失败，请刷新核对。"
            : "收藏结果尚未确认，请先核对收藏状态，避免重复操作。"
          : error instanceof ApiError && [401, 403].includes(error.status)
            ? "登录账号或收藏权限已变化，请重新登录或刷新。"
            : "无法完成收藏操作，目标可能已下架，请刷新后重试。",
      });
      return false;
    } finally {
      lease.finish(resolved);
      if (this.operation === operation) {
        this.operation = null;
        this.update({ busy: false });
      }
    }
  }
}
