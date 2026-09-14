// login.load-test.js
// Run with: k6 run login.load-test.js
// Requires the server actually running (staging/local), e.g.
//   BASE_URL=http://localhost:3000 k6 run login.load-test.js

/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '5s', target: 5 },   // warm up
    { duration: '15s', target: 10 }, // ramp to modest peak load
    { duration: '20s', target: 10 }, // hold
    { duration: '5s', target: 0 },   // cool down
  ],
  thresholds: {
    // bcrypt.compare is CPU-bound and this suite hits a remote/shared
    // test DB — calibrate SLOs for that, not a bare-metal benchmark
    http_req_duration: ['p(95)<10000', 'p(99)<15000'], // ms
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

// Use a pool of known-valid test accounts seeded in your staging DB,
// so k6 isn't hammering the same row (and so you're not testing
// against a single bcrypt hash caching artifact).
const TEST_USERS = Array.from({ length: 100 }).map((_, i) => ({
  email: `loadtest${i + 1}@example.com`,
  password: 'LoadTest@123',
}));

export default function () {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];

  const res = http.post(
    `${BASE_URL}/api/v1/client/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has token': (r) => {
      try {
        return !!JSON.parse(r.body).token;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}

// ============================================================
// After running, watch for:
//   - http_req_duration p(95)/p(99) — bcrypt.compare cost adds up
//     fast under concurrency since it's CPU-bound, not I/O-bound
//   - http_req_failed — DB connection pool exhaustion often shows
//     up here first under load, before latency does
// ============================================================

export function handleSummary(data) {
  return {
    'src/tests/api/client/authentication/login/login-load-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
