import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/knowledge-list.http-spec.ts"],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
