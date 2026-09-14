// run-load-tests.mjs
// Runs all client-auth k6 load scripts against the server URL from .env
// (BASE_URL defaults to https://bonafide-backend-9mly.onrender.com), so the
// load tests model the real user experience against the deployed API.
//
// Usage:
//   node src/tests/scripts/run-load-tests.mjs
//   K6_BIN=/path/to/k6 node src/tests/scripts/run-load-tests.mjs
//   BASE_URL=http://localhost:3000 node src/tests/scripts/run-load-tests.mjs

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

loadEnv();

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const K6_BIN = process.env.K6_BIN || "/tmp/opencode/k6/k6-v2.2.0-linux-amd64/k6";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = [
  "login",
  "sign-up",
  "change-password",
  "forgot-password",
  "reset-password",
].map((endpoint) =>
  path.join(
    __dirname,
    "..",
    "api",
    "client",
    "authentication",
    endpoint,
    `${endpoint}-load.js`
  )
);

let failed = false;

for (const script of SCRIPTS) {
  console.log(`\n### ${path.basename(script)}  ->  ${BASE_URL}`);
  try {
    execFileSync(K6_BIN, ["run", "--quiet", script], {
      env: { ...process.env, BASE_URL },
      stdio: "inherit",
    });
  } catch {
    console.error(`*** ${path.basename(script)} FAILED (thresholds or errors) ***`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);