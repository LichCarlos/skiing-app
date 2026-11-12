import { apiRequest, apiStreamRequest } from "../../platform/api/api-client";
import { ApiError } from "../../platform/api/api-error";
import { createSseParser } from "../../platform/api/sse";
import type { components } from "../../platform/api/openapi";
import { isAiMessage } from "./ai-validation";

export type AiMessage = components["schemas"]["AiMessageVO"];
export type AiConversation = components["schemas"]["AiConversationDetailVO"];
export type SendAiMessage = components["schemas"]["SendAiMessageDto"];
export type AiConversationPage = components["schemas"]["AiConversationPageVO"];
export type AiConversationSummary =
  components["schemas"]["AiConversationSummaryVO"];

const epochOption = (epoch?: number) =>
  epoch === undefined ? {} : { expectedSessionEpoch: epoch };
export const listConversations = (
  page: number,
  signal?: AbortSignal,
  epoch?: number,
) =>
  apiRequest<AiConversationPage>(`/ai/conversations?page=${page}&pageSize=20`, {
    signal,
    cache: "no-store",
    ...epochOption(epoch),
  });
export const createConversation = (signal?: AbortSignal, epoch?: number) =>
  apiRequest<AiConversationSummary>("/ai/conversations", {
    method: "POST",
    body: {},
    signal,
    ...epochOption(epoch),
  });
export const readConversation = (
  id: string,
  signal?: AbortSignal,
  epoch?: number,
) =>
  apiRequest<AiConversation>(`/ai/conversations/${encodeURIComponent(id)}`, {
    signal,
    cache: "no-store",
    ...epochOption(epoch),
  });
export const deleteConversation = (
  id: string,
  signal?: AbortSignal,
  epoch?: number,
) =>
  apiRequest<void>(`/ai/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    signal,
    ...epochOption(epoch),
  });

export async function verifyAiAccount(
  userId: number,
  signal: AbortSignal,
  epoch?: number,
) {
  signal.throwIfAborted();
  const user = await apiRequest<components["schemas"]["CurrentUserVO"]>(
    "/auth/me",
    { signal, cache: "no-store", ...epochOption(epoch) },
  );
  signal.throwIfAborted();
  if (
    user.userId !== userId ||
    !user.permissionKeys.includes("ai:conversation:use")
  )
    throw new ApiError("AI identity changed", {
      status: 403,
      code: null,
      traceId: null,
    });
}

export async function sendAiMessage(
  id: string,
  body: SendAiMessage,
  onDelta: (text: string) => void,
  signal: AbortSignal,
  boundary?: { epoch: number; check(): void },
): Promise<AiMessage> {
  boundary?.check();
  const response = await apiStreamRequest(
    `/ai/conversations/${encodeURIComponent(id)}/messages`,
    {
      method: "POST",
      body,
      signal,
      ...epochOption(boundary?.epoch),
    },
  );
  const reader = response.body!.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const abortReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abortReader, { once: true });
  let completed: AiMessage | undefined;
  let outputLength = 0;
  const parser = createSseParser(({ event, data }) => {
    boundary?.check();
    if (completed) return;
    if (!["delta", "completed", "error"].includes(event)) return;
    const payload: unknown = JSON.parse(data);
    if (!isRecord(payload)) throw new Error("Invalid AI stream event");
    if (event === "error")
      throw new ApiError("AI 回答生成失败，请重试。", {
        status: 502,
        code: null,
        traceId: typeof payload.traceId === "string" ? payload.traceId : null,
      });
    if (event === "delta") {
      if (typeof payload.text !== "string") throw new Error("Invalid AI delta");
      outputLength += payload.text.length;
      if (outputLength > 100_000)
        throw new Error("AI response exceeded output limit");
      onDelta(payload.text);
    } else {
      if (!isAiMessage(payload) || payload.role !== "assistant")
        throw new Error("Invalid AI completed message");
      completed = payload;
    }
  });
  try {
    boundary?.check();
    while (!completed) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      boundary?.check();
      if (done) {
        parser.push(decoder.decode());
        break;
      }
      parser.push(decoder.decode(value, { stream: true }));
    }
    signal.throwIfAborted();
    boundary?.check();
    if (!completed)
      throw new Error("连接提前结束，回答尚未确认保存。请使用原请求重试。");
    return completed;
  } finally {
    signal.removeEventListener("abort", abortReader);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function aiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "登录已过期，请重新登录。";
    if (error.status === 403) return "当前账号尚未获准使用 AI，请联系管理员。";
    if (error.status === 404) return "会话不存在或已删除。";
    if (error.status === 409)
      return "请求仍在生成中或发生冲突，请稍后使用原请求重试。";
    if (error.status === 429) return "每分钟最多发送 5 条新消息，请稍后重试。";
  }
  return "请求失败，请检查网络并重试。";
}

// Only known public App routes are navigable; never trust a generated URL.
export function citationRoute(
  citation: components["schemas"]["AiCitationVO"],
): string | null {
  if (
    !/^[1-9]\d*$/.test(citation.sourceId) ||
    Number(citation.sourceId) > 2147483647
  )
    return null;
  switch (citation.sourceType) {
    case "resort":
      return `/resorts/${citation.sourceId}`;
    case "article":
      return `/knowledge/${citation.sourceId}`;
    case "dynamic":
      return `/dynamics/${citation.sourceId}`;
    default:
      return null;
  }
}
