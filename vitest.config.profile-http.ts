import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/profile.http-spec.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
