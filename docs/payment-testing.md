# Testing Paystack payments, agent assignment and reports

How to test a verification from payment to report, for each plan: one-time, monthly and quarterly. Everything runs against the Render deployment with Paystack in **test mode**.

All paths start with `https://bonafide-backend-9mly.onrender.com/api/v1`. Send the token from a login as `Authorization: Bearer <token>`.

## 1. Before you start

- **Render deployment:** it must include commit `46f3ab9` (naira test prices) or later.
- **Render environment:**
  - `PAYSTACK_SECRET_KEY` is the **test** key (`sk_test_…`), the same one as in `src/.env`.
  - `PAYSTACK_TEST_USD_TO_NGN_RATE=1600`.
- **Paystack dashboard (test mode)** → Settings → API Keys & Webhooks: set the Test Webhook URL to `https://bonafide-backend-9mly.onrender.com/api/v1/webhook/paystack`.
- **Paystack test plans:** already created with `npm run paystack:test-plans`. All 6 monthly and quarterly plans have a naira plan code.
- **Logins:**
  - a client: any client account
  - an admin: your admin account
  - the test agent: `test.agent@example.com` (agent ID `cmv172n3b0000b5fjrbg5c85j`)

### Prices

The plans list shows US dollar prices. In test mode, checkout charges them in naira at ₦1,600 per dollar:

- One-time: $45, charged as ₦72,000.
- Monthly: $35, charged as ₦56,000 every month.
- Quarterly: $35, charged as ₦56,000 every 3 months.

### Paystack test card

- Card number `4084 0840 8408 4081`, any future expiry date, CVV `408`.
- PIN `0000`, then OTP `123456` if asked.
- To test a failed payment, use card `4084 0800 0000 5408`.

## 2. One-time plan

### Client: create the request and pay

1. `POST /client/login` with `{ "email", "password" }`. This gives the client token.
2. `GET /client/services/verification/verification-types`. Note a type's `id` and `slug` (e.g. `property-verification`).
3. `GET /client/verification-types/:slug/plans`. Note the `ONE_TIME` plan's `id`.
4. `POST /client/verification-requests`. It returns the request `id`, with status `DRAFT`.
   ```json
   {
     "verificationTypeId": "<type id>",
     "details": {
       "propertyName": "Lekki Gardens",
       "propertyType": "HOUSE",
       "propertyAddress": "12 Admiralty Way, Lekki Phase 1, Lagos"
     }
   }
   ```
5. `PATCH /client/verification-requests/:id/plan` with `{ "verificationPlanId": "<plan id>" }`.
6. `POST /client/verification-requests/:id/payment/initialize-paystack` (no body). It returns `authorization_url`.
7. Open `authorization_url` and pay with the test card. Checkout should show ₦72,000.
8. Paystack calls the webhook itself. Check the result:
   - `GET /client/verification-requests/:id`: status `SUBMITTED`.
   - `GET /client/verification-requests/:id/tracking`: shows the timeline.
   - `GET /client/notifications`: shows the request and payment updates.

### Admin: assign the agent

9. `POST /admin/login` with `{ "email", "password" }`. This gives the admin token.
10. `GET /admin/verification-requests?status=pending`: the request is listed.
11. `GET /admin/verification-requests/:id`: the request with its client, plan and payment.
12. `GET /admin/agents?tab=active`: the test agent is listed and available.
13. `POST /admin/verification-requests/:id/assign-agent` with `{ "agentId": "cmv172n3b0000b5fjrbg5c85j" }`. It returns `201`, and the request becomes `IN_PROGRESS`.
    - To undo it: `DELETE /admin/verification-requests/:id/assign-agent`.

### Agent: inspect and submit the report

14. `POST /admin/login` with the agent's email and password. Agents use the admin login.
15. `GET /admin/verification/agents/assignments`: note the assignment `id`.
16. `POST /admin/verification/agent-assignments/:id/start`: accepts the job and creates its checklist.
17. `GET /admin/verification/agent-assignments/:id/checklist`: lists the checklist items and their `id`s.
18. For **each** item: `PATCH /admin/verification/agent-assignments/:id/checklist/:itemId`, as multipart form data:
    - `status` = `COMPLETE`
    - `media` = one or more photos. They become the report's photos, captioned with the item's label.
19. Optional: `PATCH /admin/verification/agent-assignments-notes/:id` with `{ "additionalNotes": "Property is in excellent condition." }`. This becomes the report's Additional Notes.
20. `POST /admin/verification/agent-assignments/:id/report`: submits the report, and the request becomes `COMPLETED`.
    - It returns `400` with the unfinished items if any checklist item isn't `COMPLETE`.
21. The agent's views:
    - `GET /admin/verification/agents/reports`
    - `GET /admin/verification/agents/reports/:reportId`
    - `GET /admin/verification/agents/stats`

### Client: read and rate the report

22. `GET /client/notifications`: shows "New Agent Assigned", "Inspection Started" and "… Complete", with a `reportId`.
23. `GET /client/verification-requests/:id/report/full`: the report with client details, photos and notes.
24. `POST /client/verification-requests/:id/report/comment` with `{ "rating": 5, "comment": "Great report" }`. Step 23 then shows it under `feedback`.

### Admin: dashboards

25. `GET /admin/dashboard/stats`: totals and trends.
26. `GET /admin/dashboard/activities`: request, payment (₦72,000), agent assigned, inspection and report rows.
27. `GET /admin/dashboard/analytics?range=this_week`: today's paid request is counted.
28. `GET /admin/notifications`: the admin's notification bell.
29. `GET /admin/agents/:agentId`: the agent's profile; its stats count the report.
30. `GET /admin/users/:clientUserId`: the client's profile, with paid requests, amount spent and recent activity.

## 3. Monthly plan

Run the one-time steps with these differences:

- **Step 3:** pick the `MONTHLY` plan.
- **Step 7:** checkout shows ₦56,000. Paying also starts a Paystack subscription, and Paystack sends two webhooks: `charge.success` and `subscription.create`.
- **Step 8:** the status is `SUBMITTED`, as for one-time. The subscription is now active.
- **Step 20:** after the report, the request becomes **`AWAITING_RENEWAL`**, not `COMPLETED`.
  - The assignment is deleted for the next period. Step 15 no longer lists it, but the report stays under `GET /admin/verification/agents/reports`.

### Test the renewal

Paystack test mode can't skip ahead a month, so `scripts/simulate-paystack-event.ts` sends Paystack's renewal webhooks instead. Each one is signed with the test key, exactly as Paystack signs it. Run it from the project folder:

```
npm run paystack:simulate -- <verificationRequestId> renewal
```

What each event should do:

- **`renewal`** (a successful monthly charge):
  - It records a new ₦56,000 payment.
  - The request goes from `AWAITING_RENEWAL` to `SUBMITTED`.
  - Repeat steps 10–24 for the second period. The admin assigns an agent again, and the agent submits a second report. `GET /client/verification-requests/:id/reports` then lists both reports.
- **`renewal-failed`** (the card was declined):
  - The subscription becomes `PAYMENT_FAILED`.
  - A request in `AWAITING_RENEWAL` becomes `PAYMENT_FAILED`. A request that's `SUBMITTED` or `IN_PROGRESS` stays as it is, because that period is already paid.
- **`cancel`** (the subscription ended):
  - The subscription becomes `DISABLED`.
  - A request in `AWAITING_RENEWAL` or `PAYMENT_FAILED` becomes `COMPLETED`. If a paid period still needs its report, the request becomes `COMPLETED` when that report is submitted.

A good order to test in:

1. Pay → assign → report: the request becomes `AWAITING_RENEWAL`.
2. `renewal`: the request becomes `SUBMITTED`. Then assign → report again: `AWAITING_RENEWAL`.
3. `renewal-failed`: the request becomes `PAYMENT_FAILED`.
4. `cancel`: the request becomes `COMPLETED`.

The simulator's details:

- It only runs with a test key.
- It finds the request's subscription in the database from `.env`, so pay through checkout first.
- It sends to the Render webhook by default. To send to a local server instead, add its URL as a third argument, e.g. `http://localhost:3000/api/v1/webhook/paystack`.

## 4. Quarterly plan

The same as the monthly plan, with the `QUARTERLY` plan in step 3. Checkout shows ₦56,000, which is charged every 3 months. `renewal` stands in for the next quarter's charge.

## 5. Failed payment

1. Do steps 1–6 with any plan, then pay with the failing card `4084 0800 0000 5408`.
2. Paystack sends `charge.failed`, and the request becomes `PAYMENT_FAILED`.
3. Step 6 works again for a retry with the good card. The request then becomes `SUBMITTED`.
4. After a successful payment, step 6 returns `409` "This verification request is not available for payment."

## 6. If something goes wrong

- **Checkout shows USD, or Paystack rejects the currency:** `PAYSTACK_TEST_USD_TO_NGN_RATE` isn't set on Render, or Render uses a live key.
- **The status stays `PENDING_PAYMENT` after paying:** the webhook didn't arrive. Check the webhook URL in the Paystack dashboard, and look in Render's logs for `POST /api/v1/webhook/paystack -> 200`.
- **The simulator gets `401`:** Render's `PAYSTACK_SECRET_KEY` isn't the same as the one in `src/.env`.
- **Monthly or quarterly checkout fails with "plan not configured":** run `npm run paystack:test-plans` again.
- **Reading the logs:** each warning and error line names the request it came from, e.g. `[WARN] [PATCH /api/v1/client/verification-requests/abc] 400 …`. The next line, `PATCH … -> 400 (…ms)`, shows the response.
