import { ApiError } from "../../platform/api/api-error";
import {
  aiErrorMessage,
  type AiConversationPage,
  type AiConversationSummary,
} from "./ai-api";
import { aiConversationId } from "./conversation-run";
import { AiListRecovery } from "./list-recovery";

export interface AiListState {
  readonly busy: "create" | "delete" | null;
  readonly error: string | null;
  readonly uncertain: boolean;
  readonly reviewed: boolean;
  readonly ready: boolean;
}
interface Ports {
  verify(signal: AbortSignal): Promise<void>;
  list(page: number, signal: AbortSignal): Promise<AiConversationPage>;
  create(signal: AbortSignal): Promise<AiConversationSummary>;
  remove(id: string, signal: AbortSignal): Promise<void>;
  created(value: AiConversationSummary): void;
  removed(id: string): void;
  changed(state: AiListState): void;
}
interface Write {
  controller: AbortController;
  attempted: boolean;
  confirmed: boolean;
  lease: NonNullable<ReturnType<AiListRecovery["begin"]>>;
}

/** Owns one mounted account. Blur ends the lifetime, including retained screens. */
export class AiConversationListRun {
  private lifetime: AbortController | null = null;
  private write: Write | null = null;
  private unsubscribe: (() => void) | null = null;
  private reviewedRevision: number | null = null;
  private readRevision = 0;
  private state: AiListState = {
    busy: null,
    error: null,
    uncertain: false,
    reviewed: false,
    ready: false,
  };
  constructor(
    private readonly ports: Ports,
    private readonly recovery = new AiListRecovery(),
  ) {}
  snapshot() {
    return this.state;
  }
  activate() {
    if (this.lifetime) return;
    this.lifetime = new AbortController();
    this.unsubscribe = this.recovery.subscribe(() => this.synchronize());
    this.update({ ...this.state, ready: false });
    this.synchronize();
  }
  dispose() {
    const lifetime = this.lifetime;
    this.lifetime = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.reviewedRevision = null;
    this.readRevision++;
    const write = this.write;
    this.write = null;
    if (write?.attempted && !write.confirmed) write.lease.unknown();
    // A sent task keeps its lease until its promise settles, even after abort.
    // Preflight cannot send once this lifetime ends, so it can release now.
    else write?.lease.finish();
    this.synchronize();
    this.state = { ...this.state, busy: null, ready: false, reviewed: false };
    lifetime?.abort();
    write?.controller.abort();
  }
  acknowledgeReview() {
    if (
      !this.lifetime ||
      this.write ||
      !this.state.reviewed ||
      !this.state.ready
    )
      return;
    if (this.reviewedRevision !== null)
      this.recovery.acknowledge(this.reviewedRevision);
  }
  async loadPage(
    page: number,
    signal: AbortSignal,
  ): Promise<AiConversationPage> {
    if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * 20 > 2147483647)
      throw new Error("Invalid conversation page");
    const lifetime = this.lifetime;
    if (!lifetime) throw new DOMException("Screen inactive", "AbortError");
    const readRevision = ++this.readRevision;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    lifetime.signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted || lifetime.signal.aborted) controller.abort();
    const revision = this.recovery.snapshot().revision;
    const review = this.state.uncertain;
    this.reviewedRevision = null;
    this.update({ ...this.state, ready: false, reviewed: false });
    try {
      controller.signal.throwIfAborted();
      await this.ports.verify(controller.signal);
      controller.signal.throwIfAborted();
      const result = await this.ports.list(page, controller.signal);
      controller.signal.throwIfAborted();
      if (this.lifetime !== lifetime || this.readRevision !== readRevision)
        throw new DOMException("Screen inactive", "AbortError");
      const shared = this.recovery.snapshot();
      this.reviewedRevision =
        review &&
        shared.uncertain &&
        !shared.busy &&
        revision === shared.revision
          ? revision
          : null;
      this.update({
        ...this.state,
        ready: true,
        error: this.state.uncertain ? this.state.error : null,
        reviewed: this.reviewedRevision !== null,
      });
      return result;
    } catch (error) {
      if (
        this.lifetime === lifetime &&
        this.readRevision === readRevision &&
        !controller.signal.aborted
      )
        this.update({ ...this.state, ready: false, reviewed: false });
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
      lifetime.signal.removeEventListener("abort", abort);
    }
  }
  create() {
    return this.execute("create");
  }
  remove(id: string) {
    const parsed = aiConversationId(id);
    if (!parsed) return Promise.resolve(false);
    return this.execute("delete", parsed);
  }
  private update(state: AiListState) {
    this.state = state;
    if (this.lifetime) this.ports.changed(state);
  }
  private synchronize() {
    const shared = this.recovery.snapshot();
    this.update({
      ...this.state,
      busy: shared.busy,
      uncertain: shared.uncertain,
      reviewed:
        shared.uncertain &&
        !shared.busy &&
        this.reviewedRevision === shared.revision,
      error: shared.uncertain
        ? "操作结果尚未确认，可能已经完成。请刷新并核对会话列表，避免重复操作。"
        : this.state.uncertain
          ? null
          : this.state.error,
    });
  }
  private async execute(kind: "create" | "delete", id?: string) {
    const lifetime = this.lifetime;
    if (!lifetime || this.write || this.state.uncertain || !this.state.ready)
      return false;
    const lease = this.recovery.begin(kind);
    if (!lease) return false;
    const write: Write = {
      controller: new AbortController(),
      attempted: false,
      confirmed: false,
      lease,
    };
    this.write = write;
    const current = () =>
      this.lifetime === lifetime &&
      this.write === write &&
      !write.controller.signal.aborted;
    this.update({ ...this.state, busy: kind, error: null });
    try {
      await this.ports.verify(write.controller.signal);
      if (!current()) return false;
      write.attempted = true;
      if (kind === "create") {
        const value = await this.ports.create(write.controller.signal);
        if (!current()) return false;
        if (!aiConversationId(value.conversationId))
          throw new Error("Invalid created conversation");
        write.confirmed = true;
        this.ports.created(value);
      } else {
        await this.ports.remove(id!, write.controller.signal);
        if (!current()) return false;
        write.confirmed = true;
        this.ports.removed(id!);
      }
      return true;
    } catch (error) {
      if (!current()) return false;
      if (write.confirmed) {
        this.update({
          ...this.state,
          error: "操作已完成，页面更新失败。请刷新后查看。",
        });
        return true;
      }
      const rejected =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      if (write.attempted && !rejected) lease.unknown();
      this.update({
        ...this.state,
        ready:
          error instanceof ApiError && [401, 403].includes(error.status)
            ? false
            : this.state.ready,
        error: this.state.uncertain
          ? this.state.error
          : aiListErrorMessage(error),
      });
      return false;
    } finally {
      lease.finish();
      if (this.write === write) {
        this.write = null;
        this.synchronize();
      }
    }
  }
}

export function lastConversationPage(total: number, pageSize = 20) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function aiListErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429) return "操作过于频繁，请稍后重试。";
    if (error.status === 409) return "会话状态已变化，请刷新后重试。";
  }
  return aiErrorMessage(error);
}
