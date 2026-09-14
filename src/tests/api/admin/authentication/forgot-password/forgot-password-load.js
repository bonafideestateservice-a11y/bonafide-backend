// forgot-password-load.js
// Run with: k6 run forgot-password-load.js
// Requires the server actually running (staging/local), e.g.
//   BASE_URL=http://localhost:3000 k6 run src/tests/api/admin/authentication/forgot-password/forgot-password-load.js

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
    // This suite hits a remote/shared test DB — calibrate SLOs for that
    http_req_duration: ['p(95)<5000', 'p(99)<8000'], // ms
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

// Pool of pre-seeded accounts; forgot-password only needs a valid email.
const TEST_USERS = Array.from({ length: 100 }).map((_, i) => ({
  email: `adminloadtest${i + 1}@example.com`,
}));

export default function () {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];

  const res = http.post(
    `${BASE_URL}/api/v1/admin/forgot-password`,
    JSON.stringify({ email: user.email }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'returns reset token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'success' && typeof body.token === 'string' && body.token.length > 0;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'src/tests/api/admin/authentication/forgot-password/forgot-password-load-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}