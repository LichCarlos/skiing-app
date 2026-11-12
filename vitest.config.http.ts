import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/settings.http-spec.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
