import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/resort-list.http-spec.ts"],
    fileParallelism: false,
    testTimeout: 90_000,
  },
});
