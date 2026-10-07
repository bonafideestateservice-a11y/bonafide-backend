# Known Issues

Issues found during the Swagger documentation review and the recurring-verification work (October 2026). None are fixed yet. Line numbers are approximate; search for the named function if they've moved.

Severity:

- **Critical:** exploitable now; fix before the next release.
- **High:** wrong behaviour users will hit, or a smaller security gap.
- **Medium:** incorrect in edge cases.
- **Low:** inconsistency or cleanup.

## Summary

| #   | Severity | Issue                                                                      |
| --- | -------- | -------------------------------------------------------------------------- |
| 1   | Critical | Forgot-password returns the reset OTP, so any account can be taken over    |
| 2   | Critical | Client sign-up accepts `role` from the body, so anyone can become an admin |
| 3   | Critical | An agent report endpoint returns clients' password hashes                  |
| 4   | Critical | The full report endpoint has no authentication or ownership check          |
| 5   | High     | Login and forgot-password reveal which emails have accounts                |
| 6   | High     | Admin password reset works for client accounts                             |
| 7   | High     | verify-otp accepts any user's OTP                                          |
| 8   | High     | Webhook requests can hang when the database fails early                    |
| 9   | High     | Paystack signature is checked against re-serialised JSON, not the raw body |
| 10  | High     | Uploading checklist photos without a status resets a completed item        |
| 11  | High     | A report can be submitted for an assignment that was never started         |
| 12  | High     | Clients see reports that haven't been reviewed                             |
| 13  | Medium   | Bad input (malformed JSON, wrong upload field, non-string OTP) returns 500 |
| 14  | Medium   | Uploads have no size or type limits, and run before ownership checks       |
| 15  | Medium   | `viewedAt` is never set, so "unviewed reports" counts every report         |
| 16  | Medium   | Several endpoints ignore construction and business addresses               |
| 17  | Medium   | Request status can be edited after payment                                 |
| 18  | Medium   | Paystack renewals without a subscription code are matched by a heuristic   |
| 19  | Medium   | Admin dashboard: "pending" tab and display status disagree                 |
| 20  | Medium   | Agent "start" returns every checklist item as PENDING                      |
| 21  | Low      | Duplicate `GET /client/verification-requests/reports-summary` route        |
| 22  | Low      | Inconsistent response shapes and error codes across endpoints              |
| 23  | Low      | Smaller correctness and cleanup items                                      |

---

## Critical

### 1. Forgot-password returns the reset OTP

- **Where:**
  - `src/api/client/authentication/handlers/forgot-password/forgot-password-v1.ts` (response body, marked `TODO`)
  - `src/api/admin/authentication/handlers/forgot-password/forgot-password-v1.ts`
- **Problem:** both endpoints include the OTP in the HTTP response, as well as emailing it.
- **Impact:** anyone who knows an email address can call forgot-password, read the OTP, then call reset-password and take over the account. Through the admin endpoint (see #6) this includes admin accounts.
- **Fix:** remove `otp` from both responses. For local testing, log it at debug level only when `NODE_ENV` isn't production.

### 2. Client sign-up honours `role` from the request body

- **Where:** `src/api/client/authentication/handlers/signup/sign-up-v1.ts` (`resolvedRole`)
- **Problem:** `POST /api/v1/client/sign-up` uses `role` from the body when it's a valid `ROLE`.
- **Impact:** anyone can create an `ADMIN` or `AGENT` account and use every admin endpoint.
- **Fix:** always create `ROLE.CLIENT` in the client sign-up. Create staff accounts through an admin-only endpoint.

### 3. Agent report endpoint returns clients' password hashes

- **Where:** `getAgentVerificationRequestReport` in `src/api/admin/verification/services/database/verification-report.ts` (~line 138, `include: { user: true }`), returned as-is by `GET /api/v1/admin/verification/agents/verification-requests/{id}/report`.
- **Problem:** the response contains the client's full `User` row, including `password`, plus the full agent row.
- **Impact:** any agent who wrote a report for a client receives that client's password hash.
- **Fix:** replace `include: { user: true }` and `agent: true` with `select`s of the fields the agent needs (name, email, phone).

### 4. Full report has no authentication or ownership check

- **Where:** `GET /api/v1/client/verification-requests/{id}/report/full` in `src/api/client/verification/index.ts` (no `checkJwt`); `getVerificationRequestFullReportData` looks the request up by ID only.
- **Impact:** anyone with a request ID can read the full report: the address, findings, photos and agent notes.
- **Fix:** add `checkJwt` and look the request up by `{ id, userId }`, like `/report-summary` does.

---

## High

### 5. Login and forgot-password reveal which emails have accounts

- **Where:**
  - client and admin `login-v1.ts`: 404 for an unknown email
  - both `forgot-password-v1.ts`: 404 for an unknown email
  - admin login also returns 403 for `CLIENT` accounts **before** checking the password, which reveals the account's role
- **Fix:**
  - **Login:** return the same 401 "Invalid credentials" for an unknown email and a wrong password, and check the role only after the password.
  - **Forgot-password:** always return 200 "If an account exists, we've sent a code".

### 6. Admin password reset works for client accounts

- **Where:** `findAdmin` in `src/api/admin/authentication/services/database/admin.ts` (~line 67) doesn't filter by role. It's used by the admin forgot-password and reset-password endpoints.
- **Fix:** restrict the admin flow to `ADMIN` and `AGENT` roles.

### 7. verify-otp accepts any user's OTP

- **Where:** client and admin `verify-otp-v1.ts`
- **Problem:** the OTP isn't checked against an email or user, so a valid code from any account passes.
- **Fix:** require `email` and verify the OTP against that user's reset token.

### 8. Webhook requests can hang when the database fails early

- **Where:**
  - `paystackWebhook` in `src/api/webhooks/paystack.ts`: the `webhookEvent.findUnique` and `upsert` calls before the `try`
  - the Paystack callback handler
  - `stripeWebhook` in `src/api/webhooks/stripe.ts`: the same calls before the `try`
- **Problem:** the app runs Express 4, so a rejected promise outside `try/catch` never reaches the error handler. The request hangs and the provider retries until it times out.
- **Fix:** move those calls inside the `try`, or wrap the handlers so rejections reach `next`.

### 9. Paystack signature checked against re-serialised JSON

- **Where:** `verifySignature` in `src/api/webhooks/paystack.ts`, which hashes `JSON.stringify(req.body)`.
- **Problem:** if re-serialising changes anything (key order, number formatting, unicode escapes), genuine events fail the check with 400.
- **Fix:** hash `req.rawBody`, which `app.ts` already stores, the same way the Stripe webhook does.

### 10. Uploading checklist photos without a status resets a completed item

- **Where:** `src/api/admin/verification/handlers/update-agent-checklist-item/update-agent-checklist-item.v1.ts` (~line 35): `status` defaults to `PENDING`.
- **Problem:** an agent who adds a photo to a completed item without resending `status: COMPLETE` sets it back to `PENDING`.
- **Fix:** leave the status unchanged when the request doesn't include one.

### 11. A report can be submitted for an assignment that was never started

- **Where:** `submitAgentAssignmentReport` in `src/api/admin/verification/services/database/verification-report.ts`
- **Problem:** an assignment with no checklist items (start was never called) has nothing "remaining", so the report is accepted.
- **Fix:** reject submission when the checklist is empty or the assignment is still `ASSIGNED`.

### 12. Clients see reports that haven't been reviewed

- **Where:** `report-summary`, `report/full` and `reports` in `src/api/client/verification/` don't filter on `reviewStatus`.
- **Problem:** reports that are `PENDING` review or `REVISION_REQUESTED` are shown to clients.
- **Decide:** whether clients should only see `APPROVED` reports. There's no approval endpoint yet, so filtering now would hide every report.

---

## Medium

### 13. Bad input returns 500 instead of 400

- **Where:** `src/middlewares/error-handler.ts` treats every non-`ApiError` as 500. Affected inputs:
  - malformed JSON bodies (`express.json` errors)
  - multer errors, e.g. files sent under the wrong field name
  - a non-string `otp` or `email` in verify-otp and reset-password (`otp.trim()` throws a TypeError)
- **Fix:**
  - map `SyntaxError` (with `type === "entity.parse.failed"`) and `MulterError` to 400 in the error handler
  - type-check `otp` and `email` before using them
  - add a minimum length to reset-password, matching sign-up and change-password (8)

### 14. Uploads have no limits and run before checks

- **Where:** the multer setup in each router (`multer({ storage: memoryStorage() })`), and the handlers that upload to Cloudinary: update-profile (client and admin), checklist item media, verification documents.
- **Problems:**
  - No file size, count or type limits.
  - Anything that isn't a PDF is uploaded to Cloudinary as an image, so other file types fail with 500.
  - Files are uploaded **before** the profile, item or ownership check, so a request that then returns 404 leaves orphaned files in Cloudinary.
- **Fix:**
  - set `limits` and a `fileFilter`
  - validate ownership before uploading
  - choose the Cloudinary resource type from the MIME type

### 15. `viewedAt` is never set

- **Where:** nothing in `src` writes `VerificationReport.viewedAt`.
- **Impact:**
  - `unviewedReportsCount` (`countUnviewedVerificationReports`) counts every report the client has ever had.
  - `viewed` in `GET /client/verification-requests/{id}/reports` is always `false`.
- **Fix:** set `viewedAt` when the client opens the full report.

### 16. Construction and business addresses are ignored

- **Where:**
  - client tracking and report-summary handlers
  - the admin assignment report and report detail (`toReportView` in `verification-report.ts`)
- **Problem:** these read only `details.propertyAddress`. Construction and business requests always show "Address not provided" or an empty address. Other endpoints already fall back to `constructionAddress`, then `businessAddress`.
- **Fix:** share one address helper across all of them.

### 17. Request status can be edited after payment

- **Where:** `PATCH /client/verification-requests/{id}`, `PATCH .../plan` and `POST .../documents` don't check the request's status.
- **Impact:** a client can change the details or plan after paying, or after an agent has been assigned.
- **Fix:** allow edits only in `DRAFT`, `PENDING_PAYMENT` or `PAYMENT_FAILED`.

### 18. Paystack renewals without a subscription code use a heuristic

- **Where:** `findSubscriptionForCharge` in `src/api/webhooks/paystack.ts`
- **Problem:** when a renewal `charge.success` has no subscription code, and a customer has several subscriptions on the same plan, the renewal is credited to the subscription whose next payment date is closest to the charge (logged as a warning). This could pick the wrong property.
- **Fix:** confirm whether Paystack renewal charges always include the subscription code. If not, match renewals on `invoice.update` events instead, which include it.

### 19. Admin dashboard: "pending" tab and display status disagree

- **Where:**
  - `getDisplayStatus` in `src/api/admin/dashboard/handlers/get-verification-requests/get-verification-requests.v1.ts`
  - `getStatusFilter` in `src/api/admin/dashboard/services/database/verification-request.ts`
- **Problems:**
  - `DRAFT` and `PENDING_PAYMENT` display as "PENDING" under "all", but the "pending" filter only includes `SUBMITTED`.
  - An `ASSIGNED` assignment overrides any request status, so a completed request could display as ASSIGNED.
  - `sortBy=status` sorts by the raw enum, not the displayed status.
  - `numberOfPendingRequest` counts only `SUBMITTED`; `numberOfProperties` counts only verified properties.
- **Fix:** define the display statuses once and derive both the filter and the label from them.

### 20. Agent "start" returns every checklist item as PENDING

- **Where:** `startAgentAssignment` in `src/api/admin/verification/services/database/agent-assignment.ts`
- **Problem:** calling start again returns `status: "PENDING"` for items that are already complete. `requiresMedia` is matched to the template by `sortOrder` and silently falls back to `false`.
- **Fix:** return each item's real status, and store `requiresMedia` on the checklist item.

---

## Low

### 21. Duplicate route

`GET /verification-requests/reports-summary` is registered twice in `src/api/client/verification/index.ts`. The second registration is unreachable. Remove it.

### 22. Inconsistent response shapes and error codes

- **Response shapes:** three are in use.
  - `{ message, token, user }`: sign-up, login, social sign-in
  - `{ status, message }`: change-password, verify-otp, reset-password
  - a bare object: profile and settings endpoints

  Several client verification endpoints use `{ status, message, data }` while their neighbours return bare objects.

- **Paystack callback errors** are `{ error }` instead of the standard `{ status, message }`.
- **Paystack webhook** returns `{ received: true }` for duplicates but plain-text "OK" otherwise. Stripe always returns `{ received: true }`.
- **Wrong owner:** notification-preferences returns 404, while the other request endpoints return 403.
- **Questionable status codes:**
  - "Verification type not found" is a 400, not a 404.
  - "Verification plan not selected" is a 404.

### 23. Smaller items

- **Currency:** the assignment detail falls back to `currency: "USD"` when there's no payment; the database default is NGN (`get-agent-assignment.v1.ts`).
- **Agent reports list:**
  - `verificationType` is returned as an object `{ name }`, not a string.
  - `district` holds the full address.
  - `generatedAt` and `reportUrl` are `""` instead of `null` when missing.
- **Case-sensitive search:** searches match addresses case-sensitively (`string_contains`) but names case-insensitively.
- **Report `media`:** it only includes documents attached directly to the report. Checklist photos are attached to checklist items, so it's usually empty.
- **Agent-only endpoints:** `adminOrAgent` lets admins through, but admins always get 404 "Verification agent not found." unless they also have an agent record.
- **Tracking:**
  - `inspectionStartedAt` is filled from `scheduledAt`.
  - The agent's `isVerified` is hard-coded to `true`.
- **Full report:** `ownershipFindings` falls back to the whole `findings` array serialised as a JSON string.
- **Unpaginated activity feed:** the admin activity feed returns every sent notification for all users, with no pagination.
- **Facebook 409:** Facebook emails are always treated as verified, so the 409 path in `facebook-auth-v1.ts` can't happen. Remove it, or confirm Meta only returns verified emails.
- **Expiring cards:** `subscription.expiring_cards` (Paystack) looks up the user and does nothing. Send a card-update email, or remove the handler.
- **Random event IDs:** a Paystack event with no reference, invoice code, ID or subscription code gets a random event ID, so it can never be detected as a duplicate.
- **Old event IDs:** events processed before the event-ID change were stored under the old IDs. A redelivery of one is processed again, and could send a second payment email.
- **Mixed user ID sources:** change-password reads `req.token.id` while other handlers read `req.user.id`. Both work.
- **Admin agent list:** the dashboard has no endpoint to list agents for the "assign agent" screen; only `GET /admin/agents/me` exists.
- **Dashboard stats:** `getDashboardStats` (`src/api/admin/dashboard/services/database/dashboard.ts`) loads every client and every agent just to count them. Use `count()` queries instead.

---

## Also open (from the recurring-verifications plan)

See `docs/recurring-verifications-plan.md`:

- the admin request detail view with report history
- the "renewal paid" notification wording and an admin reminder job
- the expiring-card email (1d)
