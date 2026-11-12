import {
  assertSessionEpoch,
  sessionEpoch,
} from "../../platform/auth/secure-session";
import {
  createConversation,
  deleteConversation,
  listConversations,
  readConversation,
  sendAiMessage,
  verifyAiAccount,
  type SendAiMessage,
} from "./ai-api";
import {
  validateConversation,
  validateConversationPage,
  validateConversationSummary,
} from "./ai-validation";

export const aiKeys = {
  list: (userId: number, epoch: number) =>
    ["ai-conversations", userId, epoch] as const,
  detail: (userId: number, epoch: number, id: string) =>
    ["ai-conversation", userId, epoch, id] as const,
};

/** Captured once per account/grant/session lifetime, never recaptured after awaits. */
export function createAiSession(userId: number, epoch = sessionEpoch()) {
  const check = (signal: AbortSignal) => {
    signal.throwIfAborted();
    assertSessionEpoch(epoch);
  };
  const verify = async (signal: AbortSignal) => {
    check(signal);
    await verifyAiAccount(userId, signal, epoch);
    check(signal);
  };
  return {
    epoch,
    verify,
    async list(page: number, signal: AbortSignal) {
      check(signal);
      const result = await listConversations(page, signal, epoch);
      check(signal);
      validateConversationPage(result, page);
      await verify(signal);
      return result;
    },
    async read(id: string, signal: AbortSignal) {
      await verify(signal);
      const result = await readConversation(id, signal, epoch);
      check(signal);
      validateConversation(result, id);
      await verify(signal);
      return result;
    },
    async create(signal: AbortSignal) {
      check(signal);
      const result = await createConversation(signal, epoch);
      check(signal);
      validateConversationSummary(result);
      return result;
    },
    async remove(id: string, signal: AbortSignal) {
      check(signal);
      await deleteConversation(id, signal, epoch);
      check(signal);
    },
    async send(
      id: string,
      body: SendAiMessage,
      delta: (text: string) => void,
      signal: AbortSignal,
    ) {
      check(signal);
      const result = await sendAiMessage(id, body, delta, signal, {
        epoch,
        check: () => check(signal),
      });
      await verify(signal);
      return result;
    },
  };
}
