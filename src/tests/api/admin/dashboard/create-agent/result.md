# POST /api/v1/admin/agents — test results

## Tests

- `create-agent-unit.test.ts` (12 tests): creates with hashed password and trimmed/lowercased fields; blank phone/region stored as null; 400 for missing/invalid fullName, email, password (< 8), non-string phone/region; 409 when the email exists (lookup and P2002 race); 500 on database failure.
- `create-agent-integration.test.ts` (5 tests): creates the AGENT user and VerificationAgent with `mustChangePassword: true` and no password in the response; the agent shows up in `GET /admin/agents`; the agent can log in at `/admin/login` (`user.mustChangePassword: true`), and the flag is false after `/admin/change-password`; 409 on duplicate email; 400 on missing password; 403 for a client, 401 without a token.

## Results

```
PASS create-agent-unit.test.ts
PASS create-agent-integration.test.ts
PASS change-password-unit / change-password-integration
PASS reset-password-unit / reset-password-integration
PASS login-unit / login-integration
PASS get-agents-unit / get-agents-integration
PASS jobs/notifications (event-handlers, processors)
```

## Application changes

- `User.mustChangePassword` (migration `20261026090000_user_must_change_password`), set by this endpoint and cleared by admin change-password and reset-password.
- Replaces the earlier version of this endpoint (setup code emailed to the agent); its `createAgent` service in `verification/services/database/agent-assignment.ts` was removed.
- No load test: the endpoint is not part of the load-test suite.
