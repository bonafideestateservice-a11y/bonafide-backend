// reset-password-load.js
// Run with: k6 run reset-password-load.js
// Requires the server actually running (staging/local), e.g.
//   BASE_URL=http://localhost:3000 k6 run src/tests/api/admin/authentication/reset-password/reset-password-load.js
//
// Flow per iteration: forgot-password → reset-password/:token.
// The password is reset to the SAME value so the pool accounts stay
// valid for every iteration (idempotent writes).

/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '5s', target: 5 },
    { duration: '15s', target: 10 },
    { duration: '20s', target: 10 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    // Two sequential HTTP calls per iteration (forgot + reset) and this
    // suite hits a remote/shared test DB — calibrate SLOs for that
    http_req_duration: ['p(95)<10000', 'p(99)<15000'], // ms
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

// Pool of pre-seeded accounts. Password stays unchanged because each
// iteration resets to the same value.
const TEST_PASSWORD = 'LoadTest@123';
const TEST_USERS = Array.from({ length: 100 }).map((_, i) => ({
  email: `adminloadtest${i + 1}@example.com`,
}));

export default function () {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];

  // Step 1: request a fresh reset token
  const forgotRes = http.post(
    `${BASE_URL}/api/v1/admin/forgot-password`,
    JSON.stringify({ email: user.email }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  let resetToken = null;
  try {
    const body = JSON.parse(forgotRes.body);
    if (body.status === 'success' && typeof body.token === 'string') {
      resetToken = body.token;
    }
  } catch {
    resetToken = null;
  }

  check(forgotRes, {
    'forgot-password status is 200': (r) => r.status === 200,
    'forgot-password returns reset token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'success' && typeof body.token === 'string' && body.token.length > 0;
      } catch {
        return false;
      }
    },
  });

  if (!resetToken) {
    sleep(1);
    return;
  }

  // Step 2: reset the password using the token (same value → idempotent)
  const res = http.post(
    `${BASE_URL}/api/v1/admin/reset-password/${resetToken}`,
    JSON.stringify({ password: TEST_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'reset-password status is 200': (r) => r.status === 200,
    'reset-password has success message': (r) => {
      try {
        return /reset/i.test(JSON.parse(r.body).message);
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'src/tests/api/admin/authentication/reset-password/reset-password-load-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}