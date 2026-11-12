import { describe, expect, it, vi } from "vitest";
import { createSseParser } from "./sse";

describe("SSE parser", () => {
  it("handles mixed newlines, multiline data, empty fields and split CRLF", () => {
    const onFrame = vi.fn();
    const parser = createSseParser(onFrame);
    parser.push(":heartbeat\r");
    parser.push("\nevent: delta\rdata: one\r\ndata:two\n\n");
    parser.push("data\n\nevent: ignored\n\ndata: final\n\n");
    expect(onFrame.mock.calls.map(([frame]) => frame)).toEqual([
      { event: "delta", data: "one\ntwo" },
      { event: "message", data: "" },
      { event: "message", data: "final" },
    ]);
  });
  it("discards incomplete events and limits memory for unterminated input", () => {
    const onFrame = vi.fn();
    const parser = createSseParser(onFrame);
    parser.push("event: delta\ndata: unfinished");
    expect(onFrame).not.toHaveBeenCalled();
    expect(() => parser.push("x".repeat(1_000_000))).toThrow("exceeded limit");
  });
});
