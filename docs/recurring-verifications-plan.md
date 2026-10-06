# Recurring Verifications: Change Plan

Status: **Implemented (6 Oct 2026), not yet deployed.** Items 0–9 are built and tested, except 1d (optional). See "Deploying" at the end before running the migrations.

## Goal

Monthly and quarterly plans should produce one inspection and one report **per paid period**, with:

- an agent assigned by an admin each period,
- a history of every report and who wrote it,
- agents always seeing the payment status for **their** period, not the request's latest transaction.

One-time requests must keep working exactly as they do today.

## Agreed model

- `AgentAssignment` stays **one-to-one** with `VerificationRequest`. It represents the _current_ period's job only.
- `VerificationReport` becomes **one-to-many**: one report per paid period.
- Each assignment and each report is linked to the **transaction (payment)** that paid for its period. That link answers "which period is this for?" and drives the payment status agents see.
- After a recurring request's report is submitted, the assignment is removed and the request waits for the next payment (`AWAITING_RENEWAL`). When it's paid, an admin assigns an agent again.
- The shared status rules live in `src/api/services/database/verification-lifecycle.ts`, used by both webhooks, agent assignment and report submission.

---

## Request lifecycle

Paths below leave out the `/api/v1` prefix. Webhooks arrive at `POST /webhook/paystack` and `POST /webhook/stripe`.

### Target flow

One-time:

```
DRAFT → PENDING_PAYMENT → SUBMITTED → IN_PROGRESS → COMPLETED
       (start payment)    (paid)     (assign)      (report)
```

Recurring:

```
DRAFT → PENDING_PAYMENT → SUBMITTED → IN_PROGRESS ─(report)─┐
       (start payment)    (paid)     (assign)               │
              ▲                                             ▼
              └──────────────(renewal paid)───────── AWAITING_RENEWAL
                                                     or SUBMITTED if the next
                                                        period is already paid

Subscription cancelled or disabled → COMPLETED once the last paid period is reported
```

What each status means:

- `DRAFT`: created, not paid yet.
- `PENDING_PAYMENT`: the client started checkout and hasn't paid yet.
- `AWAITING_RENEWAL` **(new)**: recurring only. Every paid period is reported; the subscription will charge the next one automatically.
- `PAYMENT_FAILED`: the payment that was due (first payment or a renewal) failed.
- `SUBMITTED`: paid, waiting for an admin to assign an agent.
- `IN_PROGRESS`: an agent is working on it.
- `COMPLETED`: one-time: report submitted. Recurring: subscription ended and every paid period reported.
- `CANCELLED`: nothing sets this yet, and it isn't part of this plan.

### What changed the request status before this change

Client endpoints:

- `POST /client/verification-requests`
  - creates the request as `DRAFT`
- `POST /client/verification-requests/:id/payment/initialize-paystack`
  - `DRAFT`, `PENDING_PAYMENT` or `PAYMENT_FAILED` → `PENDING_PAYMENT`
- `POST /client/verification-requests/:id/payment/initialize-stripe`
  - same as Paystack
- `PATCH /client/verification-requests/:id` and `PATCH /client/verification-requests/:id/plan`
  - no status change

Admin endpoints:

- `POST /admin/verification-requests/:id/assign-agent`
  - `SUBMITTED` → `IN_PROGRESS`
- `POST /admin/verification/agent-assignments/:id/report`
  - **no request change** (so nothing ever reaches `COMPLETED`)

Paystack webhook events:

- `charge.success` (first payment and every renewal)
  - anything except `COMPLETED`/`CANCELLED` → `SUBMITTED`
  - ⚠ this includes `IN_PROGRESS`, so a renewal undoes work in progress
- `charge.failed`
  - `PENDING_PAYMENT` → `PAYMENT_FAILED`
- `invoice.payment_failed` (renewal failed)
  - anything except `COMPLETED`/`CANCELLED` → `PAYMENT_FAILED`
  - ⚠ this includes `IN_PROGRESS`, even though the current period was paid
- `subscription.create`, `subscription.not_renew`, `subscription.disable`
  - subscription record only, no request change

Stripe webhook events:

- `checkout.session.completed` (first payment)
  - anything except `COMPLETED`/`CANCELLED` → `SUBMITTED`
- `invoice.paid` (renewals; the first invoice is skipped)
  - anything except `COMPLETED`/`CANCELLED` → `SUBMITTED`
  - ⚠ same `IN_PROGRESS` problem as Paystack
- `invoice.payment_failed` and `customer.subscription.deleted`
  - subscription → `INACTIVE`
  - `PENDING_PAYMENT` → `PAYMENT_FAILED`
- `customer.subscription.updated`
  - subscription status only, except that an inactive subscription moves `PENDING_PAYMENT` → `PAYMENT_FAILED`

Never set by anything: `COMPLETED`, `CANCELLED`.

### What changes the request status now

Changes are marked **(changed)** or **(new)**.

Client endpoints:

- unchanged

Admin endpoints:

- `POST /admin/verification-requests/:id/assign-agent`
  - `SUBMITTED` → `IN_PROGRESS`, as today
  - **(changed)** also requires a paid period that has no report (item 3)
- `POST /admin/verification/agent-assignments/:id/report` **(new transitions, item 4)**
  - one-time: `IN_PROGRESS` → `COMPLETED`
  - recurring, subscription ended: `IN_PROGRESS` → `COMPLETED`
  - recurring, next period already paid: `IN_PROGRESS` → `SUBMITTED`
  - recurring, otherwise: `IN_PROGRESS` → `AWAITING_RENEWAL`

Payment succeeded **(changed, item 5)**: Paystack `charge.success`, Stripe `checkout.session.completed`, Stripe `invoice.paid`

- `DRAFT`, `PENDING_PAYMENT`, `PAYMENT_FAILED` or `AWAITING_RENEWAL` → `SUBMITTED`
- `IN_PROGRESS` is left alone; report submission picks the payment up

Payment failed **(changed, item 5)**: Paystack `charge.failed`, Paystack `invoice.payment_failed`, Stripe `invoice.payment_failed`

- `PENDING_PAYMENT` or `AWAITING_RENEWAL` → `PAYMENT_FAILED`; `IN_PROGRESS` is left alone
- Stripe keeps the subscription active while it retries the charge (`past_due` counts as active)
- Stripe `customer.subscription.updated` to `unpaid` (Stripe gave up retrying) is treated the same way

Subscription ended **(new, item 5)**: Paystack `subscription.disable` and `subscription.not_renew`, Stripe `customer.subscription.deleted`, Stripe `customer.subscription.updated` to `canceled`

- `AWAITING_RENEWAL` or `PAYMENT_FAILED` → `COMPLETED`, if every paid period has a report
- `SUBMITTED` and `IN_PROGRESS` are left alone; the paid period is finished first, and report submission completes it

Unchanged: Paystack `subscription.create` only creates or updates the subscription record.

---

## Agent assignment lifecycle

### Target flow

```
(none) → ASSIGNED → ACCEPTED → REPORT_SUBMITTED        one-time: kept as history
        (assign)    (start)    (report)

(none) → ASSIGNED → ACCEPTED → deleted                 recurring: checklist moves to the report
        (assign)    (start)    (report)
```

What each status means:

- `ASSIGNED`: an admin assigned the agent; the agent hasn't started.
- `ACCEPTED`: the agent started; the checklist exists.
- `INSPECTION_SCHEDULED`: nothing sets this yet (there is a `scheduledAt` field but no endpoint for it). Not part of this plan.
- `INSPECTION_COMPLETE`: no longer set. Older rows may still have it.
- `REPORT_SUBMITTED` **(now used)**: a one-time assignment whose report is submitted.

Where the statuses show up:

- **Agent's list**, "all" filter: `ASSIGNED`, `ACCEPTED`, `INSPECTION_SCHEDULED`, `INSPECTION_COMPLETE`. Finished one-time work (`REPORT_SUBMITTED`) and released recurring work no longer appear.
- **Agent's list**, "in progress" filter: `ACCEPTED`, `INSPECTION_SCHEDULED`.
- **Admin dashboard**: "assigned" is `ASSIGNED`; "in progress" is `ACCEPTED` or `INSPECTION_SCHEDULED`.
- **Agent stats**: active = `ASSIGNED`, `ACCEPTED`, `INSPECTION_SCHEDULED`; completed = **number of reports the agent submitted** (changed, item 6).

### What changed the assignment before this change

- `POST /admin/verification-requests/:id/assign-agent` (admin)
  - creates the assignment as `ASSIGNED`
  - emits `AGENT_ASSIGNED`
- `POST /admin/verification/agent-assignments/:id/start` (admin or agent)
  - `ASSIGNED` → `ACCEPTED`
  - creates the checklist from the verification type's template
  - emits `INSPECTION_STARTED`
- `PATCH /admin/verification/agent-assignments/:id/checklist/:itemId`
  - no status change; updates the item and `progressPercent`
- `PATCH /admin/verification/agent-assignments-notes/:id`
  - no status change; updates `additionalNotes`
- `POST /admin/verification/agent-assignments/:id/report`
  - only when every checklist item is complete
  - → `INSPECTION_COMPLETE`, sets `completedAt`
  - creates the report, emits `REPORT_UPLOADED`
- Webhooks
  - never touch assignments

### What changes the assignment now

- `POST /admin/verification-requests/:id/assign-agent`
  - creates the assignment as `ASSIGNED`, as today
  - **(changed)** also stores the payment it's for (`transactionId`, item 3)
- `POST /admin/verification/agent-assignments/:id/start`
  - unchanged
- `PATCH .../checklist/:itemId` and `PATCH .../agent-assignments-notes/:id`
  - unchanged
- `POST /admin/verification/agent-assignments/:id/report` **(changed, item 4)**
  - every report records its period's payment (`transactionId`), the agent's notes (`additionalNotes`) and the checklist (`reportId` on each item)
  - one-time: → `REPORT_SUBMITTED`, so it leaves the agent's active list
  - recurring: the assignment is **deleted**, ready for the next period's assignment
- Webhooks
  - still never touch assignments

---

## 0. Admin endpoint: assign an agent ✅ Done

`POST /api/v1/admin/verification-requests/:id/assign-agent` with body `{ "agentId": "<VerificationAgent.id>" }`. Admin only.

- **Accepts:** only requests in `SUBMITTED` (paid, no agent).
- **On success:** creates the assignment, moves the request to `IN_PROGRESS`, and emits `AGENT_ASSIGNED` (notifies the client and the agent).
- **Errors:**
  - `400`: missing `agentId`, or the agent is inactive
  - `404`: request or agent not found
  - `409`: the request already has an agent, or isn't awaiting assignment

Files:

- `src/api/admin/verification/handlers/assign-verification-request-agent/`
- `assignAgentToVerificationRequest` in `src/api/admin/verification/services/database/agent-assignment.ts`
- Tests in `src/tests/api/admin/verification/assign-verification-request-agent/`

**Follow-up (done in item 3):** the assignment also stores which payment it's for, and returns `409` when there's no paid period without a report.

---

## 1. Paystack webhook fixes ✅ Done (except 1d)

These are bugs today, regardless of the recurring work.

### 1a. Cancellations are skipped as duplicates

- **Problem:** `getEventId` falls back to `subscription_code`. `subscription.create`, `subscription.not_renew` and `subscription.disable` share it, so after `subscription.create` the others are treated as already processed. Subscriptions never leave `ACTIVE`.
- **Fix:** include the event type in the ID, and prefer IDs unique to the event's object: `${event.event}:${reference ?? invoice_code ?? id ?? subscription_code}`. (Using `subscription_code` before `invoice_code` would have made two failed invoices for one subscription look like duplicates; the integration tests caught this.)
- **Note:** events processed before this change were stored under the old IDs. If Paystack redelivers one of those, it's processed again. Handlers are idempotent, except that a payment email could be sent twice.
- **File:** `src/api/webhooks/paystack.ts` (`getEventId`)

### 1b. Renewals are lost if `subscription.create` arrives before the first `charge.success`

- **Problem:** with no successful transaction yet, the handler logs a warning and returns, and the event is marked processed. No `PaystackSubscription` is saved, so every renewal later hits "transaction not found" and is dropped.
- **Fix (built):** throw so Paystack retries (responds `500`) until the first payment is recorded. (Create the subscription link on the first charge.success)

### 1c. A subscription can attach to the wrong request

- **Problem:** `handleSubscriptionCreated` picks "the user's latest successful payment on this plan". The renewal fallback looks up by customer + plan. A client with two monthly requests on the same plan gets mixed up.
- **Fix (built):** `subscription.create` doesn't carry the charge reference, so it links to the user's latest paid request on that plan **that doesn't have a subscription yet**. Two requests on one plan now get one subscription each.
- **Renewals without a subscription code** are matched by customer + plan; when several subscriptions match, the one whose next payment date is closest to the charge wins (logged as a warning). This is a heuristic: if Paystack's renewal `charge.success` always includes the subscription code, it never runs.

### 1d. `subscription.expiring_cards` does nothing

- **Not done.** Add an email asking the client to update their card, or remove the handler.

---

## 2. Schema changes and migration ✅ Done

```prisma
enum VerificationStatus {
  ...
  AWAITING_RENEWAL               // new: recurring, waiting for the next charge
}

model VerificationRequest {
  reports VerificationReport[]   // was: report VerificationReport?
}

model VerificationReport {
  verificationRequestId String          // no longer @unique
  transactionId         String? @unique // the payment this report covers
  transaction           Transaction? @relation(fields: [transactionId], references: [id])
  additionalNotes       String?         // copied from the assignment
  checklistItems        VerificationChecklistItem[]
}

model AgentAssignment {
  verificationRequestId String @unique  // unchanged: one current assignment
  transactionId         String?         // the payment for the current period
  transaction           Transaction? @relation(fields: [transactionId], references: [id])
}

model VerificationChecklistItem {
  agentAssignmentId String?             // optional, onDelete: SetNull (was Cascade)
  reportId          String?             // set when the report is submitted
}
```

Why:

- **Report `transactionId`:** one report per paid period, and it tells you which period it covers.
- **Assignment `transactionId`:** the payment status shown to agents (item 3).
- **Checklist `reportId` with `SetNull`:** deleting the assignment after a period no longer deletes that period's checklist; it stays with the report. Photos are already safe (`Document.checklistItemId` is `SetNull`).

**Migrations** (two, because Postgres can't use a new enum value in the transaction that adds it):

- `20261006120000_recurring_verification_periods`: the schema changes above.
- `20261006120100_backfill_recurring_verification_periods`: the data backfill:
  1. Link each report to the request's earliest successful payment.
  2. Copy assignment notes to the report and link checklist items to it.
  3. Link each assignment to its period's payment.
  4. Assigned requests whose period isn't reported → `IN_PROGRESS`.
  5. One-time requests with a report → `COMPLETED`, their assignment → `REPORT_SUBMITTED`.
  6. Recurring requests with a reported period: delete the assignment, then `SUBMITTED` if another period is paid, otherwise `AWAITING_RENEWAL` (`PAYMENT_FAILED` is kept).

Both were tested on a fresh Postgres seeded with each case above.

---

## 3. Link assignments to the payment they're for ✅ Done

**Assigning** (item 0's endpoint):

- Find the **oldest successful transaction with no report** for the request, and store it as `assignment.transactionId`.
- If there isn't one, reject with `409` "Verification request has no paid period awaiting an agent."

**Reading.** The assignment endpoints show `verificationRequest.transactions` ordered by `createdAt desc, take 1`. On recurring requests that can be a failed renewal attempt, or a payment for the _next_ period. Switch them to `assignment.transaction`:

- `getAgentAssignmentById` and `AgentAssignmentDetail` (`agent-assignment.ts:107` and `:134`)
- the assignment list query (`agent-assignment.ts:314`)
- `get-agent-assignment.v1.ts` (`payment` in the response)
- `getAgentAssignmentChecklist` (`payment` in the checklist response)

Assignments created before the migration with no payment linked fall back to the latest transaction.

---

## 4. Report submission ✅ Done

`submitAgentAssignmentReport` in `src/api/admin/verification/services/database/verification-report.ts`:

1. **Find the period's report** by `assignment.transactionId`, not `verificationRequest.report`, which no longer exists. Create it if missing, with `submittedByAgentId`, `generatedAt`, `transactionId` and the assignment's `additionalNotes`.
2. **Link the checklist items** to the report (`reportId`).
3. **Recurring requests only:**
   1. Delete the assignment.
   2. Set the request status:
      - if a successful transaction exists without a report: `SUBMITTED` (the next period is already paid)
      - else if the subscription has ended (Paystack `NON_RENEWING`, `DISABLED` or `EXPIRED`; Stripe `INACTIVE`): `COMPLETED`
      - else: `AWAITING_RENEWAL`
4. **One-time requests:** keep the assignment and set it to `REPORT_SUBMITTED`. Set the request to `COMPLETED`.
   Before this change nothing set `COMPLETED` anywhere, so one-time requests never finished.
5. **Emit `REPORT_UPLOADED`**, unchanged.

**Side effect:** `GET /admin/verification/agent-assignments/:id/report` reads through the assignment, so it returns `404` once a recurring assignment is released. Use **`GET /admin/verification/agents/reports/:id`** (report ID, from the agent's reports list) to open finished work: it returns the same client, address, photos and notes, plus `id`, `verificationRequestId`, `generatedAt` and `reviewStatus`, and only returns the agent's own reports.

---

## 5. Webhook status rules (Paystack and Stripe) ✅ Done

Payments must never undo in-progress work.

**Payment succeeded** (initial or renewal)

- Today: request → `SUBMITTED` unless `COMPLETED` or `CANCELLED`.
- Change: only `DRAFT`, `PENDING_PAYMENT`, `PAYMENT_FAILED` or `AWAITING_RENEWAL` → `SUBMITTED`. Leave `IN_PROGRESS`; item 4 picks the payment up.

**Paystack `invoice.payment_failed`**

- Today: request → `PAYMENT_FAILED` unless `COMPLETED` or `CANCELLED`.
- Change: only from `PENDING_PAYMENT` or `AWAITING_RENEWAL`. Never touch `IN_PROGRESS`; the current period is already paid.

**Stripe `invoice.payment_failed`**

- Today: subscription marked `INACTIVE` immediately.
- Change: `PENDING_PAYMENT`/`AWAITING_RENEWAL` → `PAYMENT_FAILED`, but keep the subscription active while Stripe retries. Deactivate only on `customer.subscription.deleted`, or when the status becomes `unpaid`, `canceled` or another non-active status (`past_due` stays active).

**Subscription disabled or deleted**

- Today: subscription status only.
- Change: if the request is `AWAITING_RENEWAL` or `PAYMENT_FAILED` with every paid period reported, request → `COMPLETED`. Paystack `subscription.not_renew` counts as ended too.

Files: `src/api/webhooks/paystack.ts` and `src/api/webhooks/stripe.ts` (`markTransactionSuccessful`, `recordRenewalPayment`, `deactivateSubscription`).

---

## 6. Agent stats ✅ Done

`getAgentStatsById` counts completed work from assignments with status `INSPECTION_COMPLETE` or `REPORT_SUBMITTED`. Recurring assignments are deleted after each period, so this count would drop.

- **Change:** count reports where `submittedByAgentId = agentId`. The rating already uses this.

---

## 7. Client endpoints ✅ Done

These assume a single `report`. Switch them to the latest report (`orderBy: { generatedAt: "desc" }, take: 1`):

- `get-verification-request-full-report`
- `get-verification-request-report-summary`
- `get-verification-request-tracking`
- `src/api/client/verification/services/database/verification-report.ts` and `verification-request.ts`

The full report and summary also take the agent, notes and photos from the report, falling back to the assignment for older reports. Tracking only shows `reportReadyAt` for the report of the current assignment's period, so last month's report isn't shown as ready while this month's inspection is in progress.

**New:** `GET /client/verification-requests/:id/reports` (authenticated, own requests only). Response `data` is newest first:

```json
{
  "id": "…",
  "generatedAt": "2026-10-05T10:00:00.000Z",
  "reviewStatus": "PENDING",
  "viewed": false,
  "agent": { "firstName": "Tunde", "lastName": "Bello" },
  "payment": { "paidAt": "2026-10-01T08:00:00.000Z", "amountInCents": 500000, "currency": "NGN" }
}
```

---

## 8. Admin dashboard (partly done)

- **"Pending" filter and display status:** "pending" means `status = SUBMITTED`, which now correctly means "paid and waiting for an agent". Assigned requests are `IN_PROGRESS` (item 0), so they no longer show as pending.
- **Display status:** `AWAITING_RENEWAL` is passed through as-is by `getDisplayStatus`. The admin frontend needs to know the new value.
- **Not done:** admin request detail with the report history and each period's payment (there's no admin request detail endpoint yet).
- **Not done (optional):** show "next payment date" from `PaystackSubscription.nextPaymentDate` or `StripeSubscription.currentPeriodEnd`.

---

## 9. Notifications (partly done)

- **Renewal paid:** admins already receive `PAYMENT_RECEIVED`. Consider wording it as "Renewal paid: needs an agent" when the request returns to `SUBMITTED`.
- **Done:** `REPORT_UPLOADED` emails take the agent's name from the report, since a recurring assignment is already deleted when the job runs.
- **Not done:** the "Renewal paid: needs an agent" wording and the reminder job below.
- **Optional scheduled job (BullMQ):** remind admins about requests sitting in `SUBMITTED` with no agent for more than N days.

---

## Open decisions

1. **When to unassign.** Built as unassign on **submission**, because there's no review step yet. If one is added, unassign on **approval** instead.
2. **Default agent.** Should the assign screen pre-select the previous period's agent? (Frontend; not built.)
3. **Cancellation mid-period.** Built as: a paid period is finished first, then the request is `COMPLETED`.
4. **One-time assignment status after the report.** Built as `REPORT_SUBMITTED`.
5. **Refunds.** Out of scope. If a period is refunded, should its assignment be cancelled?

## Testing

- **Unit:** `src/tests/api/webhooks/{paystack,stripe}/*-unit.test.ts`, `src/tests/services/verification-lifecycle.test.ts`, plus updated client handler and notification tests.
- **Integration:** `src/tests/api/webhooks/{paystack,stripe}/*-integration.test.ts` (signed payloads through the real app), `submit-agent-report-recurring-integration.test.ts` (report → release → renewal → reassign → client history), and the assign-agent tests.
- Integration tests write to whatever `DATABASE_URL` points at. To run them against a throwaway database:

```bash
docker run -d --rm --name bonafide-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=bonafide_test -p 55432:5432 postgres:15
DATABASE_URL=postgresql://postgres:test@localhost:55432/bonafide_test npx prisma migrate deploy
DATABASE_URL=postgresql://postgres:test@localhost:55432/bonafide_test npx jest --runInBand
```

A fresh database built from migrations matches `schema.prisma` exactly (checked with `prisma migrate diff`).

## Deploying

1. **Back up the database.** The backfill deletes released recurring assignments (their notes and checklist are copied to the report first) and changes request statuses.
2. Run `npx prisma migrate deploy`. It applies the two new migrations in order.
3. Deploy the API (and worker) together with the migration. The new code needs the new columns.
4. Tell the frontend about `AWAITING_RENEWAL`, `REPORT_SUBMITTED` on assignments, and `GET /client/verification-requests/:id/reports`.

**Migration history fixed (7 Oct 2026).** A fresh database couldn't be built from migrations:

- `20260917000000_add_viewed_at_to_verification_report` altered `VerificationReport` before `20260918000000_repair_verification_models` created it. It's now guarded and does nothing when the table doesn't exist yet (the repair migration already creates the column and index).
- `Notification`, `FCMToken`, their enums, `User.provider`/`providerId`, nullable `User.password` and some index changes had no migration (they were applied outside migrations). `20261007090000_add_untracked_notification_and_auth_schema` adds them, every statement guarded, so it's a no-op on databases that already have them.

**Every existing database** (Aiven is done) needs the edited migration's checksum updated, or `prisma migrate dev` reports it as "modified after it was applied" and offers to reset the database:

```sql
UPDATE "_prisma_migrations"
SET checksum = '0de9ca9835196d5f1503b6d94302889939025d7178fac418d021c7a91307bbce'
WHERE migration_name = '20260917000000_add_viewed_at_to_verification_report'
  AND checksum = '8e110ebea50dae1a866a6a373e4a911ece38122cea60dfc5f7aaf434c2a2f8c1';
```

Then run `npx prisma migrate deploy`.
