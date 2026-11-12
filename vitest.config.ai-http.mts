import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/ai-conversation.http-spec.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
