import type { SendAiMessage } from "./ai-api";
import { aiConversationId } from "./ai-validation";

/** Original idempotency DTO only, scoped to an account/conversation/runtime. */
export class AiTurnRecovery {
  private pending: Readonly<SendAiMessage> | null = null;
  private owner: symbol | null = null;
  private listeners = new Set<() => void>();
  snapshot() {
    return { pending: this.pending, busy: this.owner !== null };
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* UI observers cannot change ownership. */
      }
    }
  }
  begin(input: Readonly<SendAiMessage>) {
    if (
      this.owner ||
      (this.pending &&
        (this.pending.clientRequestId !== input.clientRequestId ||
          this.pending.content !== input.content))
    )
      return null;
    const owner = Symbol();
    this.owner = owner;
    this.pending ??= Object.freeze({
      clientRequestId: input.clientRequestId,
      content: input.content,
    });
    this.changed();
    return {
      finish: (confirmed: boolean) => {
        if (this.owner !== owner) return;
        if (confirmed) this.pending = null;
        this.owner = null;
        this.changed();
      },
    };
  }
  discard() {
    if (this.owner) return null;
    const pending = this.pending;
    this.pending = null;
    this.changed();
    return pending;
  }
}

const runtimes = new WeakMap<
  object,
  Map<number, Map<string, AiTurnRecovery>>
>();
export function aiTurnRecoveryFor(
  runtime: object,
  userId: number,
  conversationId: string,
) {
  const id = aiConversationId(conversationId);
  if (
    !Number.isInteger(userId) ||
    userId < 1 ||
    userId > 2147483647 ||
    id === null
  )
    throw new Error("AI 恢复上下文无效");
  let accounts = runtimes.get(runtime);
  if (!accounts) {
    accounts = new Map();
    runtimes.set(runtime, accounts);
  }
  let conversations = accounts.get(userId);
  if (!conversations) {
    conversations = new Map();
    accounts.set(userId, conversations);
  }
  let recovery = conversations.get(id);
  if (!recovery) {
    recovery = new AiTurnRecovery();
    conversations.set(id, recovery);
  }
  return recovery;
}
