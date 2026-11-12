import { describe, expect, it } from "vitest";
import { createAppQueryClient } from "./query-client";

describe("createAppQueryClient", () => {
  it("does not retry requests by default", () => {
    const client = createAppQueryClient();
    const options = client.getDefaultOptions();

    expect(options.queries?.retry).toBe(false);
    expect(options.mutations?.retry).toBe(false);
    client.clear();
  });
});
