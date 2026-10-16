import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC keeps the decorator metadata Nest's dependency injection relies on.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    globals: true,
    include: ["test/**/*.e2e.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://daddy:daddy@localhost:5432/daddy_jokes_test",
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1",
      JWT_SECRET: "test-jwt-secret-that-is-long-enough-0123456789",
      CODE_SECRET: "test-code-secret-that-is-long-enough-012345678",
      THROTTLE_DISABLED: "true",
      WEB_ORIGIN: "http://localhost:5173",
      UPLOAD_DIR: process.env.TEST_UPLOAD_DIR ?? "/tmp/daddy-jokes-test-uploads",
    },
  },
});
