// change-password-load.js
// Run with: k6 run change-password-load.js
// Requires the server actually running (staging/local), e.g.
//   BASE_URL=http://localhost:3000 k6 run src/tests/api/admin/authentication/change-password/change-password-load.js
//
// Flow per iteration: login for a fresh token, then change-password.
// The new password is set to the SAME value as the current password so
// the pool accounts stay valid for every iteration (idempotent writes).

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
    // login (bcrypt.compare) + change-password (bcrypt.hash) are both
    // CPU-bound and this suite hits a remote/shared test DB — calibrate
    // SLOs for that, not a bare-metal benchmark
    http_req_duration: ['p(95)<20000', 'p(99)<25000'], // ms
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

// Pool of pre-seeded accounts so load is spread and not a single DB row.
// NOTE: admin login + change-password enforce ADMIN/AGENT role — these
// accounts are seeded with role AGENT (src/tests/scripts/seed-load-users.ts).
const TEST_PASSWORD = 'LoadTest@123';
const TEST_USERS = Array.from({ length: 100 }).map((_, i) => ({
  email: `adminloadtest${i + 1}@example.com`,
  password: TEST_PASSWORD,
}));

export default function () {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];

  // Step 1: login to obtain a valid bearer token
  const loginRes = http.post(
    `${BASE_URL}/api/v1/admin/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  let token = null;
  try {
    token = JSON.parse(loginRes.body).token;
  } catch {
    token = null;
  }

  check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login returns token': (r) => {
      try {
        return !!JSON.parse(r.body).token;
      } catch {
        return false;
      }
    },
  });

  if (!token) {
    sleep(1);
    return;
  }

  // Step 2: change password — new == current so it stays idempotent.
  // Reuses the same password value to avoid invalidating the test accounts.
  const body = {
    currentPassword: user.password,
    newPassword: TEST_PASSWORD,
    confirmPassword: TEST_PASSWORD,
  };

  const res = http.post(
    `${BASE_URL}/api/v1/admin/change-password`,
    JSON.stringify(body),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );

  check(res, {
    'change-password status is 200': (r) => r.status === 200,
    'change-password has success message': (r) => {
      try {
        return /changed/i.test(JSON.parse(r.body).message);
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'src/tests/api/admin/authentication/change-password/change-password-load-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}