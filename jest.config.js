const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  testTimeout: 30000,
  transform: {
    ...tsJestTransformCfg,
  },
  // Ignore k6 load test files — they use k6-specific imports and must be run via `k6 run`
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "\\.load\\.js$", "[.-]load\\.test\\.ts$"],
  // Disconnect Prisma after all test suites finish
  globalTeardown: "./src/tests/teardown.ts",
};
