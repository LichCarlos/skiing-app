import type { OwnDynamicDetail } from "./community-api";
import {
  assertComposerDraft,
  composerSnapshot,
  ComposerConflictError,
  type ComposerDraft,
  type ComposerImage,
} from "./composer-model";
import type { createComposerSession } from "./composer-session";
import {
  saveEditedDynamicWithImages,
  publishWithImages,
  PublicationUnconfirmedError,
} from "./composer-submission";

export interface ComposerState {
  ready: boolean;
  busy: boolean;
  progress: string | null;
  error: string | null;
  outcome: "idle" | "uncertain" | "confirmed";
  conflict: boolean;
}
type Session = ReturnType<typeof createComposerSession>;
export class ComposerRun {
  private lifetime: AbortController | null = null;
  private operation: {
    controller: AbortController;
    attempted: boolean;
  } | null = null;
  private baseline: OwnDynamicDetail | null = null;
  private focusRevision = 0;
  private readRevision = 0;
  private state: ComposerState = {
    ready: false,
    busy: false,
    progress: null,
    error: null,
    outcome: "idle",
    conflict: false,
  };
  constructor(
    private readonly id: number | null,
    private readonly session: Session,
    private readonly ports: {
      changed(state: ComposerState): void;
      saved(): Promise<void> | void;
    },
  ) {}
  snapshot() {
    return this.state;
  }
  focusId() {
    return this.focusRevision;
  }
  acceptLatest(value: OwnDynamicDetail, focusId = this.focusRevision) {
    if (!this.lifetime || this.operation || this.state.outcome !== "idle")
      return false;
    if (focusId !== this.focusRevision) return false;
    this.check(this.lifetime.signal);
    this.baseline = value;
    this.update({ conflict: false, error: null });
    return true;
  }
  activate() {
    if (!this.lifetime) {
      this.lifetime = new AbortController();
      this.focusRevision++;
    }
    this.update({ ready: false, busy: false });
  }
  dispose() {
    if (this.operation?.attempted)
      this.state = {
        ...this.state,
        outcome: this.state.outcome === "confirmed" ? "confirmed" : "uncertain",
      };
    const lifetime = this.lifetime;
    this.lifetime = null;
    this.readRevision++;
    const operation = this.operation;
    this.operation = null;
    this.state = { ...this.state, ready: false, busy: false, progress: null };
    lifetime?.abort();
    operation?.controller.abort();
  }
  private update(patch: Partial<ComposerState>) {
    this.state = { ...this.state, ...patch };
    if (this.lifetime) this.ports.changed(this.state);
  }
  private check(signal: AbortSignal) {
    this.session.check(signal);
    if (!this.lifetime || this.lifetime.signal.aborted)
      throw new DOMException("Composer inactive", "AbortError");
  }
  async load(signal: AbortSignal) {
    const lifetime = this.lifetime;
    if (!lifetime || this.operation)
      throw new DOMException("Composer inactive or busy", "AbortError");
    this.update({ ready: false });
    const readRevision = ++this.readRevision;
    const controller = new AbortController(),
      abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    lifetime.signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted || lifetime.signal.aborted) controller.abort();
    try {
      this.check(controller.signal);
      const value =
        this.id === null
          ? (await this.session.verify(controller.signal), null)
          : await this.session.read(controller.signal);
      this.check(controller.signal);
      if (this.lifetime !== lifetime || readRevision !== this.readRevision)
        throw new DOMException("Superseded composer", "AbortError");
      const changed =
        this.baseline &&
        value &&
        composerSnapshot(this.baseline) !== composerSnapshot(value);
      if (!this.baseline) this.baseline = value;
      this.update({
        ready: true,
        ...(changed
          ? { conflict: true, error: "动态已更新，请重新载入最新内容后编辑。" }
          : {}),
      });
      return value;
    } finally {
      signal.removeEventListener("abort", abort);
      lifetime.signal.removeEventListener("abort", abort);
    }
  }
  async pick<T>(
    select: (signal: AbortSignal) => Promise<T>,
    accepted: (value: T) => void,
  ) {
    if (
      !this.lifetime ||
      this.operation ||
      !this.state.ready ||
      this.state.outcome !== "idle" ||
      this.state.conflict
    )
      return false;
    const operation = { controller: new AbortController(), attempted: false };
    this.operation = operation;
    this.update({ busy: true, error: null });
    try {
      await this.session.verify(operation.controller.signal);
      this.check(operation.controller.signal);
      const result = await select(operation.controller.signal);
      this.check(operation.controller.signal);
      if (this.operation !== operation) return false;
      accepted(result);
      return true;
    } catch (error) {
      if (this.operation === operation)
        this.update({
          error: error instanceof Error ? error.message : "无法选择图片",
        });
      return false;
    } finally {
      if (this.operation === operation) {
        this.operation = null;
        this.update({ busy: false });
      }
    }
  }
  async submit(draft: ComposerDraft) {
    if (
      !this.lifetime ||
      this.operation ||
      !this.state.ready ||
      this.state.outcome !== "idle" ||
      this.state.conflict
    )
      return false;
    const operation = { controller: new AbortController(), attempted: false };
    this.operation = operation;
    const current = () =>
      this.operation === operation &&
      !!this.lifetime &&
      !operation.controller.signal.aborted;
    this.update({ busy: true, error: null });
    try {
      assertComposerDraft(draft);
      const signal = operation.controller.signal;
      await this.session.verify(signal);
      this.check(signal);
      const ports = {
        isActive: () => {
          if (!current()) return false;
          try {
            this.check(signal);
            return true;
          } catch {
            return false;
          }
        },
        existingAssetId: (image: ComposerImage) =>
          image.kind === "existing" ? image.assetId : undefined,
        upload: (image: ComposerImage, index: number) => {
          this.update({
            progress: `正在上传图片 ${index + 1}/${draft.images.length}`,
          });
          return this.session.upload(image, signal);
        },
        publish: (input: Parameters<Session["save"]>[0]) => {
          this.update({ progress: "正在提交动态" });
          return this.session.save(input, this.baseline, signal, () => {
            operation.attempted = true;
          });
        },
        remove: (asset: string) => this.session.remove(asset, signal),
        publicationStarted: () => operation.attempted,
      };
      const input = {
        content: draft.content,
        ...(draft.contentFormat !== undefined ? {contentFormat:draft.contentFormat} : {}),
        images: draft.images,
        ...(draft.customFields === undefined
          ? {}
          : { customFields: draft.customFields }),
      };
      if (this.id === null)
        await publishWithImages(
          {
            ...input,
            ...(draft.resortId === null ? {} : { resortId: draft.resortId }),
          },
          ports,
        );
      else
        await saveEditedDynamicWithImages(
          { ...input, resortId: draft.resortId },
          ports,
        );
      if (!current()) return false;
      this.update({ outcome: "confirmed", ready: false });
      try {
        await this.ports.saved();
      } catch {
        if (current())
          this.update({
            error: "提交已完成，页面更新失败，请到我的动态核对。",
          });
      }
      return true;
    } catch (error) {
      if (!current()) return false;
      const conflict =
        error instanceof ComposerConflictError ||
        (error instanceof PublicationUnconfirmedError &&
          error.cause instanceof ComposerConflictError);
      const uncertain =
        operation.attempted && error instanceof PublicationUnconfirmedError;
      this.update({
        conflict,
        ...(uncertain ? { outcome: "uncertain" } : {}),
        error: conflict
          ? "动态已更新，请重新载入最新内容后编辑。"
          : uncertain
            ? "提交结果尚未确认，请到我的动态核对，避免重复提交。"
            : "无法提交，请核对内容、账号与权限后重试。",
      });
      return false;
    } finally {
      if (this.operation === operation) {
        this.operation = null;
        this.update({ busy: false, progress: null });
      }
    }
  }
}
