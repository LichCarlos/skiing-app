import { describe, expect, it } from "vitest";
import {
  isAiMessage,
  validateConversation,
  validateConversationPage,
  validateConversationSummary,
} from "./ai-validation";
const id = "e9b35d28-193f-46f6-bdf4-dd6c9194ad25";
const item = {
  conversationId: id,
  title: null,
  status: "active",
  createdAt: "2026-11-02T00:00:00Z",
  updatedAt: "2026-11-02T00:00:00Z",
  messageCount: 0,
};
const message = {
  messageId: "2",
  role: "user",
  content: "提问",
  status: "complete",
  createdAt: item.createdAt,
  citations: [],
};
describe("AI read response boundaries", () => {
  it("accepts empty details, uppercase route IDs and complete user/assistant history", () => {
    expect(() =>
      validateConversation({ ...item, messages: [] }, id.toUpperCase()),
    ).not.toThrow();
    expect(() =>
      validateConversation(
        {
          ...item,
          messageCount: 2,
          messages: [
            message,
            { ...message, role: "assistant", messageId: "3" },
          ],
        },
        id,
      ),
    ).not.toThrow();
  });
  it.each([
    null,
    [],
    { ...item, conversationId: "../" },
    { ...item, title: 2 },
    { ...item, status: "deleted" },
    { ...item, messageCount: -1 },
    { ...item, messageCount: NaN },
    { ...item, createdAt: "invalid" },
  ])("rejects malformed summary %j", (input) => {
    expect(() => validateConversationSummary(input)).toThrow();
  });
  it.each([
    { page: 2 },
    { pageSize: 0 },
    { total: -1 },
    { total: 0 },
    { items: null },
    { items: [item, { ...item, conversationId: id.toUpperCase() }], total: 2 },
  ])("rejects mismatched pagination/duplicates %j", (patch) => {
    expect(() =>
      validateConversationPage(
        { items: [item], total: 1, page: 1, pageSize: 20, ...patch },
        1,
      ),
    ).toThrow();
  });
  it.each([
    { messages: null },
    { messages: [message] },
    { messages: [{ ...message, role: "system" }], messageCount: 1 },
    { messages: [message, message], messageCount: 2 },
    { conversationId: "d58f0ffe-e95f-4f7a-abd6-1c5536132dfe" },
  ])("rejects history identity/count/duplicate violations %j", (patch) => {
    expect(() =>
      validateConversation({ ...item, messages: [], ...patch }, id),
    ).toThrow();
  });
  it.each([
    { messageId: "01" },
    { messageId: "0" },
    { status: "pending" },
    { content: " " },
    { citations: [null] },
    {
      citations: [
        {
          sourceType: "secret",
          sourceId: "1",
          title: "t",
          excerpt: "x",
          href: null,
        },
      ],
    },
  ])("rejects invalid complete message %j", (patch) => {
    expect(isAiMessage({ ...message, ...patch })).toBe(false);
  });
});
