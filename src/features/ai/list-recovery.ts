export type AiListOperation = "create" | "delete";

/** Runtime/account-scoped uncertainty and outstanding task ownership, no credentials. */
export class AiListRecovery {
  private owner: symbol | null = null;
  private operation: AiListOperation | null = null;
  private uncertain = false;
  private revision = 0;
  private listeners = new Set<() => void>();
  snapshot() {
    return {
      busy: this.operation,
      uncertain: this.uncertain,
      revision: this.revision,
    };
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    this.revision++;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* Observers cannot release ownership. */
      }
    }
  }
  begin(operation: AiListOperation) {
    if (this.owner || this.uncertain) return null;
    const owner = Symbol();
    this.owner = owner;
    this.operation = operation;
    this.changed();
    return {
      unknown: () => {
        if (this.owner !== owner || this.uncertain) return;
        this.uncertain = true;
        this.changed();
      },
      finish: () => {
        if (this.owner !== owner) return;
        this.owner = null;
        this.operation = null;
        this.changed();
      },
    };
  }
  acknowledge(revision: number) {
    if (this.owner || !this.uncertain || this.revision !== revision)
      return false;
    this.uncertain = false;
    this.changed();
    return true;
  }
}

const runtimes = new WeakMap<object, Map<number, AiListRecovery>>();
export function aiListRecoveryFor(runtime: object, userId: number) {
  if (!Number.isInteger(userId) || userId < 1 || userId > 2147483647)
    throw new Error("AI 列表恢复上下文无效");
  let accounts = runtimes.get(runtime);
  if (!accounts) {
    accounts = new Map();
    runtimes.set(runtime, accounts);
  }
  let recovery = accounts.get(userId);
  if (!recovery) {
    recovery = new AiListRecovery();
    accounts.set(userId, recovery);
  }
  return recovery;
}
