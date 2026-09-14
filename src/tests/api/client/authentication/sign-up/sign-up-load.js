// sign-up-load.js
// Run with: k6 run sign-up-load.js
// Requires the server actually running (staging/local), e.g.
//   BASE_URL=http://localhost:3000 k6 run src/tests/api/client/authentication/sign-up/sign-up-load.js

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
    // bcrypt.hash is CPU-bound and this suite hits a remote/shared
    // test DB — calibrate SLOs for that, not a bare-metal benchmark
    http_req_duration: ['p(95)<10000', 'p(99)<15000'], // ms
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

export default function () {
  // Use a random suffix per iteration to avoid 409 Conflicts
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const user = {
    fullName: `Load Test User ${randomSuffix}`,
    email: `loadtest-${randomSuffix}@example.com`,
    password: 'LoadTest@123',
    termsAndCondition: true,
  };

  const res = http.post(
    `${BASE_URL}/api/v1/client/sign-up`,
    JSON.stringify(user),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'status is 201': (r) => r.status === 201,
    'has token': (r) => {
      try {
        return !!JSON.parse(r.body).token;
      } catch {
        return false;
      }
    },
    'has user without password': (r) => {
      try {
        return JSON.parse(r.body).user.password === undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'src/tests/api/client/authentication/sign-up/sign-up-load-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}