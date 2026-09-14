# Client Authentication — Test Results

Date: 2026-09-14

## Summary

| Endpoint | Method / Route | Unit | Integration (real DB) | Load (k6) | Overall |
|---|---|---|---|---|---|
| Sign Up | `POST /api/v1/client/sign-up` | ✅ | ✅ | ✅ | ✅ Pass |
| Login | `POST /api/v1/client/login` | ✅ | ✅ | ✅ | ✅ Pass |
| Change Password | `POST /api/v1/client/change-password` | ✅ | ✅ | ✅ | ✅ Pass |
| Forgot Password | `POST /api/v1/client/forgot-password` | ✅ | ✅ | ✅ | ✅ Pass |
| Reset Password | `POST /api/v1/client/reset-password/:token` | ✅ | ✅ | ✅ | ✅ Pass |

## Suite totals

| Suite | Result |
|---|---|
| Jest unit + integration | 11/11 suites passed — 48/48 tests passed |
| k6 load | 5/5 scenarios passed — 0 thresholds crossed |

## Per-endpoint detail

### Sign Up — `POST /api/v1/client/sign-up`
- Unit: ✅ `sign-up-unit.test.ts`
- Integration: ✅ `sign-up-integration.test.ts` (400 missing email, 409 duplicate email, 201 creates user)
- Load: ✅ 147 requests, 99.3% checks pass, 0.7% failed, p95 = 4.02s, p99 = 8.96s

### Login — `POST /api/v1/client/login`
- Unit: ✅ `login-unit.test.ts`
- Integration: ✅ `login-integration.test.ts` (400 missing email, 404 unknown user, 401 wrong password, 200 token + no password field, timing budget)
- Load: ✅ 103 requests, 100% checks pass, 0.0% failed, p95 = 3.75s

### Change Password — `POST /api/v1/client/change-password`
- Unit: ✅ `change-password-unit.test.ts`
- Integration: ✅ `change-password-integration.test.ts` (401 no token, 400 missing fields, 401 wrong current password, 200 success)
- Load: ✅ 72 requests, 100% checks pass, 0.0% failed, p95 = 10.33s
  - Two bcrypt operations per iteration (login `compare` + change `hash`) — the slowest endpoint under load.

### Forgot Password — `POST /api/v1/client/forgot-password`
- Unit: ✅ `forgot-password-unit.test.ts`
- Integration: ✅ `forgot-password-integration.test.ts` (400 missing email, 404 unknown email, 200 reset token issued)
- Load: ✅ 201 requests, 100% checks pass, 0.0% failed, p95 = 1.77s

### Reset Password — `POST /api/v1/client/reset-password/:token`
- Unit: ✅ `reset-password-unit.test.ts`
- Integration: ✅ `reset-password-integration.test.ts` (400 missing fields, 400 invalid/expired token, 400 reused token, full forgot→reset→login flow)
- Load: ✅ 148 requests, 100% checks pass, 0.0% failed, p95 = 4.47s

## Notes & environment

- Tests run against a **shared remote test database** (Aiven Postgres) with the API running locally on `http://localhost:3000`.
- Load profile: k6, ramp 5 → 10 → 10 → 0 VUs over 45s. Latency thresholds were calibrated for the shared test DB + CPU-bound bcrypt work, not a bare-metal benchmark.
- Load users: 100 pre-seeded accounts `loadtest1..100@example.com` / `LoadTest@123` (`src/tests/scripts/seed-load-users.ts`).
- Load scripts write JSON summaries next to each test:
  - `login/login-load-summary.json` — `sign-up/sign-up-load-summary.json` — `change-password/change-password-load-summary.json` — `forgot-password/forgot-password-load-summary.json` — `reset-password/reset-password-load-summary.json`

## How to re-run

```bash
# Unit + integration
npm test

# Load (server must be running on :3000)
/tmp/opencode/k6/k6-v2.2.0-linux-amd64/k6 run src/tests/api/client/authentication/login/login-load.js
/tmp/opencode/k6/k6-v2.2.0-linux-amd64/k6 run src/tests/api/client/authentication/sign-up/sign-up-load.js
/tmp/opencode/k6/k6-v2.2.0-linux-amd64/k6 run src/tests/api/client/authentication/change-password/change-password-load.js
/tmp/opencode/k6/k6-v2.2.0-linux-amd64/k6 run src/tests/api/client/authentication/forgot-password/forgot-password-load.js
/tmp/opencode/k6/k6-v2.2.0-linux-amd64/k6 run src/tests/api/client/authentication/reset-password/reset-password-load.js
```