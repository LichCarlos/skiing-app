import { ApiError } from "../../platform/api/api-error";
import type { OwnDynamicDetail } from "./community-api";

export interface OwnDynamicState {
  readonly ready: boolean;
  readonly busy: boolean;
  readonly uncertain: boolean;
  readonly reviewed: boolean;
  readonly error: string | null;
}
interface Ports {
  verify(signal: AbortSignal, deleting: boolean): Promise<void>;
  read(signal: AbortSignal): Promise<OwnDynamicDetail>;
  remove(signal: AbortSignal): Promise<void>;
  removed(): void;
  changed(state: OwnDynamicState): void;
}
interface Write {
  controller: AbortController;
  attempted: boolean;
  confirmed: boolean;
}
const initial: OwnDynamicState = {
  ready: false,
  busy: false,
  uncertain: false,
  reviewed: false,
  error: null,
};

/** A focused screen owns one account and target. Never retries DELETE. */
export class OwnDynamicRun {
  private lifetime: AbortController | null = null;
  private write: Write | null = null;
  private readRevision = 0;
  private state = initial;
  constructor(
    private readonly id: number,
    private readonly ports: Ports,
  ) {}
  snapshot() {
    return this.state;
  }
  activate() {
    if (this.lifetime) return;
    this.lifetime = new AbortController();
    this.update({ ready: false, busy: false, reviewed: false });
  }
  dispose() {
    const lifetime = this.lifetime;
    this.lifetime = null;
    const write = this.write;
    this.write = null;
    this.readRevision++;
    if (write?.attempted && !write.confirmed) this.markUncertain();
    this.state = { ...this.state, ready: false, busy: false, reviewed: false };
    lifetime?.abort();
    write?.controller.abort();
  }
  private update(patch: Partial<OwnDynamicState>) {
    this.state = { ...this.state, ...patch };
    if (this.lifetime) this.ports.changed(this.state);
  }
  private markUncertain() {
    this.update({
      uncertain: true,
      reviewed: false,
      error: "删除结果尚未确认，可能已经完成。请先刷新核对，不要直接重复删除。",
    });
  }
  acknowledgeReview() {
    if (
      !this.lifetime ||
      this.write ||
      !this.state.ready ||
      !this.state.reviewed
    )
      return;
    this.update({ uncertain: false, reviewed: false, error: null });
  }
  async load(signal: AbortSignal): Promise<OwnDynamicDetail> {
    const lifetime = this.lifetime;
    if (!lifetime || this.write)
      throw new DOMException("Screen inactive or writing", "AbortError");
    const revision = ++this.readRevision;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    lifetime.signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted || lifetime.signal.aborted) controller.abort();
    this.update({ ready: false, reviewed: false });
    try {
      controller.signal.throwIfAborted();
      await this.ports.verify(controller.signal, false);
      controller.signal.throwIfAborted();
      const result = await this.ports.read(controller.signal);
      controller.signal.throwIfAborted();
      await this.ports.verify(controller.signal, false);
      controller.signal.throwIfAborted();
      if (this.lifetime !== lifetime || revision !== this.readRevision)
        throw new DOMException("Superseded read", "AbortError");
      if (result.dynamicId !== this.id)
        throw new Error("Unexpected own dynamic");
      this.update({
        ready: true,
        reviewed: this.state.uncertain,
        error: this.state.uncertain ? this.state.error : null,
      });
      return result;
    } catch (error) {
      if (
        this.lifetime === lifetime &&
        revision === this.readRevision &&
        !controller.signal.aborted
      )
        this.update({ ready: false, reviewed: false });
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
      lifetime.signal.removeEventListener("abort", abort);
    }
  }
  async remove() {
    const lifetime = this.lifetime;
    if (!lifetime || this.write || !this.state.ready || this.state.uncertain)
      return false;
    const write: Write = {
      controller: new AbortController(),
      attempted: false,
      confirmed: false,
    };
    this.write = write;
    this.readRevision++;
    const current = () =>
      this.lifetime === lifetime &&
      this.write === write &&
      !write.controller.signal.aborted;
    this.update({ busy: true, ready: false, error: null });
    try {
      await this.ports.verify(write.controller.signal, true);
      if (!current()) return false;
      // Recheck ownership/visibility against the protected endpoint, not a cached card.
      const latest = await this.ports.read(write.controller.signal);
      if (!current()) return false;
      if (latest.dynamicId !== this.id)
        throw new Error("Unexpected own dynamic");
      await this.ports.verify(write.controller.signal, true);
      if (!current()) return false;
      write.attempted = true;
      await this.ports.remove(write.controller.signal);
      if (!current()) return false;
      write.confirmed = true;
      this.ports.removed();
      return true;
    } catch (error) {
      if (!current()) return false;
      if (write.confirmed) {
        this.update({ error: "删除已完成，页面更新失败。请返回列表刷新。" });
        return true;
      }
      const rejected =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      if (write.attempted && !rejected) this.markUncertain();
      else
        this.update({
          error: "无法完成删除，请刷新资料并核对账号、权限和动态状态。",
        });
      return false;
    } finally {
      if (this.write === write) {
        this.write = null;
        this.update({ busy: false });
      }
    }
  }
}
