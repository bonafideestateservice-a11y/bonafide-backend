# Recurring Verifications: Change Plan

Status: **In review.** Work through the items in order and tick them off as they ship.

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
- After a recurring request's report is submitted, the assignment is removed and the request waits for the next payment. When it's paid, an admin assigns an agent again.

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
              └──────────────(waiting for renewal)── PENDING_PAYMENT
                                                     or SUBMITTED if the next
                                                        period is already paid

Subscription cancelled or disabled → COMPLETED once the last paid period is reported
```

What each status means:

- `DRAFT`: created, not paid yet.
- `PENDING_PAYMENT`: payment started, or (recurring) waiting for the next charge.
- `PAYMENT_FAILED`: the payment that was due failed.
- `SUBMITTED`: paid, waiting for an admin to assign an agent.
- `IN_PROGRESS`: an agent is working on it.
- `COMPLETED`: one-time: report submitted. Recurring: subscription ended and every paid period reported.
- `CANCELLED`: nothing sets this yet, and it isn't part of this plan.

### What changes the request status today

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

### What changes the request status after the plan

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
  - recurring, otherwise: `IN_PROGRESS` → `PENDING_PAYMENT`

Payment succeeded **(changed, item 5)**: Paystack `charge.success`, Stripe `checkout.session.completed`, Stripe `invoice.paid`

- `DRAFT`, `PENDING_PAYMENT` or `PAYMENT_FAILED` → `SUBMITTED`
- `IN_PROGRESS` is left alone; report submission picks the payment up

Payment failed **(changed, item 5)**: Paystack `charge.failed`, Paystack `invoice.payment_failed`, Stripe `invoice.payment_failed`

- `PENDING_PAYMENT` → `PAYMENT_FAILED` only
- Stripe keeps the subscription active while it retries the charge

Subscription ended **(new, item 5)**: Paystack `subscription.disable`, Stripe `customer.subscription.deleted`

- `PENDING_PAYMENT` → `COMPLETED`, if every paid period has a report
- `IN_PROGRESS` is left alone; report submission completes it

Unchanged: Paystack `subscription.create` and `subscription.not_renew`, and Stripe `customer.subscription.updated`, only update the subscription record.

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
- `INSPECTION_COMPLETE`: set today when the report is submitted.
- `REPORT_SUBMITTED`: nothing sets this yet; the plan proposes using it (see below).

Where the statuses show up:

- **Agent's list**, "all" filter: `ASSIGNED`, `ACCEPTED`, `INSPECTION_SCHEDULED`, `INSPECTION_COMPLETE`. Submitted work stays on the list today because it's `INSPECTION_COMPLETE`.
- **Agent's list**, "in progress" filter: `ACCEPTED`, `INSPECTION_SCHEDULED`.
- **Admin dashboard**: "assigned" is `ASSIGNED`; "in progress" is `ACCEPTED` or `INSPECTION_SCHEDULED`.
- **Agent stats**: active = `ASSIGNED`, `ACCEPTED`, `INSPECTION_SCHEDULED`; completed = `INSPECTION_COMPLETE`, `REPORT_SUBMITTED`.

### What changes the assignment today

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

### What changes the assignment after the plan

- `POST /admin/verification-requests/:id/assign-agent`
  - creates the assignment as `ASSIGNED`, as today
  - **(changed)** also stores the payment it's for (`transactionId`, item 3)
- `POST /admin/verification/agent-assignments/:id/start`
  - unchanged
- `PATCH .../checklist/:itemId` and `PATCH .../agent-assignments-notes/:id`
  - unchanged
- `POST /admin/verification/agent-assignments/:id/report` **(changed, item 4)**
  - one-time: → `REPORT_SUBMITTED` (proposed, instead of `INSPECTION_COMPLETE`), so it leaves the agent's active list and counts as completed
  - recurring: the checklist is linked to the report, then the assignment is **deleted**, ready for the next period's assignment
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

**Follow-up in item 3:** also store which payment the assignment is for.

---

## 1. Paystack webhook fixes (independent; do first)

These are bugs today, regardless of the recurring work.

### 1a. Cancellations are skipped as duplicates

- **Problem:** `getEventId` falls back to `subscription_code`. `subscription.create`, `subscription.not_renew` and `subscription.disable` share it, so after `subscription.create` the others are treated as already processed. Subscriptions never leave `ACTIVE`.
- **Fix:** include the event type in the ID: `${event.event}:${reference ?? subscription_code ?? id}`.
- **File:** `src/api/webhooks/paystack.ts` (`getEventId`)

### 1b. Renewals are lost if `subscription.create` arrives before the first `charge.success`

- **Problem:** with no successful transaction yet, the handler logs a warning and returns, and the event is marked processed. No `PaystackSubscription` is saved, so every renewal later hits "transaction not found" and is dropped.
- **Fix:** throw so Paystack retries (respond `500`), or create the subscription link when the first `charge.success` is processed. (Create the subscription link on the first charge.success)

### 1c. A subscription can attach to the wrong request

- **Problem:** `handleSubscriptionCreated` picks "the user's latest successful payment on this plan". The renewal fallback looks up by customer + plan. A client with two monthly requests on the same plan gets mixed up.
- **Fix:** link the subscription using the initial transaction's own `verificationRequestId`, which is known from its `reference`. Don't guess from the plan.

### 1d. `subscription.expiring_cards` does nothing

- **Fix:** add an email to the client asking them to update their card, or remove the handler. (Optional.)

---

## 2. Schema changes and migration

```prisma
model VerificationRequest {
  reports VerificationReport[]   // was: report VerificationReport?
}

model VerificationReport {
  verificationRequestId String          // no longer @unique
  transactionId         String? @unique // the payment this report covers
  transaction           Transaction? @relation(fields: [transactionId], references: [id])
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

**Migration and backfill:**

1. For each existing assignment and report, set `transactionId` to the request's successful transaction.
2. Set `reportId` on checklist items whose assignment has a report.
3. Drop `@unique` on `VerificationReport.verificationRequestId`.

---

## 3. Link assignments to the payment they're for

**Assigning** (item 0's endpoint):

- Find the **oldest successful transaction with no report** for the request, and store it as `assignment.transactionId`.
- If there isn't one, reject with `409` (no paid period to work on).

**Reading.** The assignment endpoints show `verificationRequest.transactions` ordered by `createdAt desc, take 1`. On recurring requests that can be a failed renewal attempt, or a payment for the _next_ period. Switch them to `assignment.transaction`:

- `getAgentAssignmentById` and `AgentAssignmentDetail` (`agent-assignment.ts:107` and `:134`)
- the assignment list query (`agent-assignment.ts:314`)
- `get-agent-assignment.v1.ts` (`payment` in the response)

---

## 4. Report submission for recurring requests

`submitAgentAssignmentReport` in `src/api/admin/verification/services/database/verification-report.ts`:

1. **Find the period's report** by `assignment.transactionId`, not `verificationRequest.report`, which no longer exists. Create it if missing, with `submittedByAgentId`, `generatedAt` and `transactionId`.
2. **Link the checklist items** to the report (`reportId`).
3. **Recurring requests only:**
   1. Delete the assignment.
   2. Set the request status:
      - if the subscription is disabled or cancelled: `COMPLETED`
      - else if a successful transaction exists without a report: `SUBMITTED` (the next period is already paid)
      - else: `PENDING_PAYMENT`
4. **One-time requests:** keep the assignment and set it to `REPORT_SUBMITTED`. Set the request to `COMPLETED`.
   **Today nothing sets `COMPLETED` anywhere.** Submitting a report only moves the assignment to `INSPECTION_COMPLETE`, so one-time requests never finish and the dashboard's "completed" filter is always empty.
5. **Emit `REPORT_UPLOADED`**, unchanged.

---

## 5. Webhook status rules (Paystack and Stripe)

Payments must never undo in-progress work.

**Payment succeeded** (initial or renewal)

- Today: request → `SUBMITTED` unless `COMPLETED` or `CANCELLED`.
- Change: only `DRAFT`, `PENDING_PAYMENT` or `PAYMENT_FAILED` → `SUBMITTED`. Leave `IN_PROGRESS`; item 4 picks the payment up.

**Paystack `invoice.payment_failed`**

- Today: request → `PAYMENT_FAILED` unless `COMPLETED` or `CANCELLED`.
- Change: only from `PENDING_PAYMENT`. Never touch `IN_PROGRESS`; the current period is already paid.

**Stripe `invoice.payment_failed`**

- Today: subscription marked `INACTIVE` immediately.
- Change: record the failure, but keep the subscription active while Stripe retries. Deactivate only on `customer.subscription.deleted`, or when the status becomes `unpaid` or `canceled`.

**Subscription disabled or deleted**

- Today: subscription status only.
- Change: if the request is `PENDING_PAYMENT` with nothing left to report, request → `COMPLETED`.

Files: `src/api/webhooks/paystack.ts` and `src/api/webhooks/stripe.ts` (`markTransactionSuccessful`, `recordRenewalPayment`, `deactivateSubscription`).

---

## 6. Agent stats

`getAgentStatsById` counts completed work from assignments with status `INSPECTION_COMPLETE` or `REPORT_SUBMITTED`. Recurring assignments are deleted after each period, so this count would drop.

- **Change:** count reports where `submittedByAgentId = agentId`. The rating already uses this.

---

## 7. Client endpoints

These assume a single `report`. Switch them to the latest report (`orderBy: { generatedAt: "desc" }, take: 1`):

- `get-verification-request-full-report`
- `get-verification-request-report-summary`
- `get-verification-request-tracking`
- `src/api/client/verification/services/database/verification-report.ts` and `verification-request.ts`

**New:** `GET /client/verification-requests/:id/reports`, a list of every report with its date, agent name and period payment date. The client sees one entry per period.

---

## 8. Admin dashboard

- **"Pending" filter and display status:** "pending" means `status = SUBMITTED`, which now correctly means "paid and waiting for an agent". Assigned requests are `IN_PROGRESS` (item 0), so they no longer show as pending.
- **Admin request detail:** show the report history and each period's payment.
- **Optional:** show "next payment date" from `PaystackSubscription.nextPaymentDate` or `StripeSubscription.currentPeriodEnd`.

---

## 9. Notifications

- **Renewal paid:** admins already receive `PAYMENT_RECEIVED`. Consider wording it as "Renewal paid: needs an agent" when the request returns to `SUBMITTED`.
- **No other changes:** `AGENT_ASSIGNED`, `INSPECTION_STARTED` and `REPORT_UPLOADED` work per period as they are.
- **Optional scheduled job (BullMQ):** remind admins about requests sitting in `SUBMITTED` with no agent for more than N days.

---

## Open decisions

1. **When to unassign.** Nothing approves reports or requests revisions yet, so the plan unassigns on **submission**. If a review step is added, unassign on **approval** instead, so an agent asked for a revision still has the job.
2. **Default agent.** Should the assign screen pre-select the previous period's agent, for continuity on the same property? No, leave this
3. **Cancellation mid-period.** If a subscription is cancelled while an agent is working, finish the paid period, then mark `COMPLETED`? (The plan assumes yes.)
4. **One-time assignment status after the report.** The plan proposes `REPORT_SUBMITTED` so finished work leaves the agent's active list. Today it stays there as `INSPECTION_COMPLETE`.
5. **Refunds.** Out of scope. If a period is refunded, should its assignment be cancelled?

## Suggested order

1. Item 1 (Paystack fixes). Small and independent, and it protects real payments now.
2. Item 2 (schema and migration).
3. Items 3 and 4 together (assignment ↔ payment link, report submission).
4. Item 5 (webhook status rules).
5. Items 6, 7, 8 and 9.
