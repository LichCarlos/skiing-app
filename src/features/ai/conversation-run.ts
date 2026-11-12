import type { AiMessage, SendAiMessage } from "./ai-api";
import { aiErrorMessage } from "./ai-api";
import { ApiError } from "../../platform/api/api-error";
import { AiTurnRecovery } from "./turn-recovery";
export { aiConversationId } from "./ai-validation";

export interface ConfirmedAiTurn {
  readonly request: Readonly<SendAiMessage>;
  readonly message: AiMessage;
}
export interface AiRunState {
  readonly denied?: boolean;
  readonly pending: Readonly<SendAiMessage> | null;
  readonly partial: string;
  readonly sending: boolean;
  readonly error: string | null;
  readonly confirmed: readonly ConfirmedAiTurn[];
}
interface AiRunPorts {
  requestId(): string;
  verify(signal: AbortSignal): Promise<void>;
  send(
    request: SendAiMessage,
    delta: (text: string) => void,
    signal: AbortSignal,
  ): Promise<AiMessage>;
  changed(state: AiRunState): void;
  confirmed(): void;
}

/** One account/conversation lifetime. Server messages are never fabricated. */
export class AiConversationRun {
  private active = false;
  private controller: AbortController | null = null;
  private lease: ReturnType<AiTurnRecovery["begin"]> = null;
  private unsubscribe: (() => void) | null = null;
  private state: AiRunState = {
    pending: null,
    partial: "",
    sending: false,
    error: null,
    confirmed: [],
  };
  constructor(
    private readonly ports: AiRunPorts,
    private readonly recovery = new AiTurnRecovery(),
  ) {}
  snapshot() {
    return this.state;
  }
  activate() {
    if (this.active) return;
    this.active = true;
    this.unsubscribe = this.recovery.subscribe(() => this.synchronize());
    if (this.recovery.snapshot().pending && !this.state.error)
      this.state = {
        ...this.state,
        error: "上次回答尚未确认，可使用原请求重试，确认已保存的结果。",
      };
    this.synchronize();
  }
  dispose() {
    this.active = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    const controller = this.controller;
    this.controller = null;
    this.lease?.finish(false);
    this.lease = null;
    controller?.abort();
    this.state = {
      ...this.state,
      sending: false,
      ...(controller
        ? { error: "已停止接收。可使用原请求重试，确认已保存的结果。" }
        : {}),
    };
  }
  async send(content: string) {
    if (
      !this.active ||
      this.controller ||
      this.recovery.snapshot().pending ||
      this.recovery.snapshot().busy ||
      this.state.denied
    )
      return false;
    const text = content.trim();
    if (!text || Array.from(text).length > 4000) {
      this.update({ ...this.state, error: "请输入 1–4000 字符的问题。" });
      return false;
    }
    const request = Object.freeze({
      clientRequestId: this.ports.requestId(),
      content: text,
    });
    return this.execute(request);
  }
  async retry() {
    if (
      !this.active ||
      this.controller ||
      !this.recovery.snapshot().pending ||
      this.recovery.snapshot().busy ||
      this.state.denied
    )
      return false;
    return this.execute(this.recovery.snapshot().pending!);
  }
  edit(): string | null {
    if (
      !this.active ||
      this.controller ||
      !this.recovery.snapshot().pending ||
      this.recovery.snapshot().busy ||
      this.state.denied
    )
      return null;
    const content = this.recovery.discard()!.content;
    this.update({ ...this.state, pending: null, partial: "", error: null });
    return content;
  }
  stop() {
    if (!this.active || !this.controller) return;
    const controller = this.controller;
    this.controller = null;
    this.lease?.finish(false);
    this.lease = null;
    controller.abort();
    this.update({
      ...this.state,
      sending: false,
      error: "已停止接收。可使用原请求重试，确认已保存的结果。",
    });
  }
  observeHistory(messages: readonly Pick<AiMessage, "messageId">[]) {
    if (!this.active) return;
    const ids = new Set(messages.map((message) => message.messageId));
    const confirmed = this.state.confirmed.filter(
      (turn) => !ids.has(turn.message.messageId),
    );
    if (confirmed.length !== this.state.confirmed.length || this.state.denied)
      this.update({
        ...this.state,
        confirmed,
        denied: false,
        ...(this.state.denied ? { error: null } : {}),
      });
  }
  private update(state: AiRunState) {
    this.state = state;
    this.synchronize();
  }
  private synchronize() {
    const shared = this.recovery.snapshot();
    this.state = {
      ...this.state,
      pending: shared.pending,
      sending: shared.busy,
      ...(this.state.pending && !shared.pending
        ? { error: null, partial: "" }
        : {}),
    };
    if (this.active) this.ports.changed(this.state);
  }
  private async execute(request: Readonly<SendAiMessage>) {
    const lease = this.recovery.begin(request);
    if (!lease) return false;
    this.lease = lease;
    // The synchronous controller lock precedes validation/auth/network awaits.
    const controller = new AbortController();
    this.controller = controller;
    const current = () =>
      this.active &&
      this.controller === controller &&
      !controller.signal.aborted;
    this.update({
      ...this.state,
      pending: request,
      partial: "",
      sending: true,
      error: null,
    });
    try {
      await this.ports.verify(controller.signal);
      if (!current()) return false;
      const message = await this.ports.send(
        { ...request },
        (text) => {
          if (current())
            this.update({ ...this.state, partial: this.state.partial + text });
        },
        controller.signal,
      );
      if (!current()) return false;
      const confirmed = this.state.confirmed.some(
        (turn) => turn.message.messageId === message.messageId,
      )
        ? this.state.confirmed
        : [...this.state.confirmed, { request, message }];
      lease.finish(true);
      this.update({
        ...this.state,
        pending: null,
        partial: "",
        sending: false,
        error: null,
        confirmed,
      });
      // Invalidation failure must never turn a committed reply into a failed send.
      try {
        this.ports.confirmed();
      } catch {
        /* Reply remains confirmed locally. */
      }
      return true;
    } catch (error) {
      if (current())
        this.update({
          ...this.state,
          sending: false,
          error: aiErrorMessage(error),
          ...(error instanceof ApiError &&
          [401, 403, 404].includes(error.status)
            ? { denied: true, partial: "", confirmed: [] }
            : {}),
        });
      return false;
    } finally {
      lease.finish(false);
      if (this.lease === lease) this.lease = null;
      if (this.controller === controller) this.controller = null;
    }
  }
}

export function visibleConfirmedTurns(
  turns: readonly ConfirmedAiTurn[],
  messages: readonly Pick<AiMessage, "messageId">[],
) {
  const ids = new Set(messages.map((message) => message.messageId));
  return turns.filter((turn) => !ids.has(turn.message.messageId));
}
