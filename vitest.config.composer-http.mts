import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/composer.http-spec.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
