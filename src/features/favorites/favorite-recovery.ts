import type { FavoriteTarget } from "./favorites-api";

type Target = Readonly<FavoriteTarget>;
type Pending = Readonly<{ target: Target; confirmed: boolean }>;
/** One account within one QueryClient runtime, with no credentials or content. */
export class FavoriteRecoveryLedger {
  private pending: Pending | null = null;
  private owner: symbol | null = null;
  private listeners = new Set<() => void>();
  version = 0;
  snapshot() {
    return { busy: this.owner !== null, pending: this.pending };
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    this.version++;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* A UI observer cannot release or retain a lease. */
      }
    }
  }
  begin(target: FavoriteTarget, reviewing: boolean) {
    if (
      this.owner ||
      (reviewing
        ? !this.pending ||
          this.pending.target.targetType !== target.targetType ||
          this.pending.target.targetId !== target.targetId
        : this.pending)
    )
      return null;
    const owner = Symbol(),
      captured = Object.freeze({
        targetType: target.targetType,
        targetId: target.targetId,
      });
    this.owner = owner;
    this.changed();
    return {
      attempted: () => {
        if (this.owner !== owner) return;
        this.pending = Object.freeze({ target: captured, confirmed: false });
        this.changed();
      },
      confirmed: () => {
        if (this.owner !== owner || !this.pending) return;
        this.pending = Object.freeze({ ...this.pending, confirmed: true });
        this.changed();
      },
      rejected: () => {
        if (this.owner !== owner || reviewing) return;
        this.pending = null;
        this.changed();
      },
      finish: (resolved: boolean) => {
        if (this.owner !== owner) return;
        if (resolved) this.pending = null;
        this.owner = null;
        this.changed();
      },
    };
  }
}

const runtimes = new WeakMap<object, Map<number, FavoriteRecoveryLedger>>();
export function favoriteLedgerForAccount(
  runtime: object,
  userId: number | null,
) {
  if (userId === null) return new FavoriteRecoveryLedger();
  if (!Number.isInteger(userId) || userId < 1 || userId > 2147483647)
    throw new Error("收藏账号编号无效");
  let accounts = runtimes.get(runtime);
  if (!accounts) {
    accounts = new Map();
    runtimes.set(runtime, accounts);
  }
  let ledger = accounts.get(userId);
  if (!ledger) {
    ledger = new FavoriteRecoveryLedger();
    accounts.set(userId, ledger);
  }
  return ledger;
}
