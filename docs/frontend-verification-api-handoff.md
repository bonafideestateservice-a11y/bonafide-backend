# Frontend handoff: verification pricing, reports, and agent workflow

This note summarizes the backend contract and current gaps for the frontend. Paths below include
the `/api/v1` prefix.

## What “not available” means

- **No real Basic/Standard/Premium report examples from staging:** we have not retrieved saved
  report responses from staging for one request at each tier. The report section definitions and
  API schema tell us the expected fields, and this note includes representative shapes, but those
  are not copied from real reports. The catalogue and Premium quote flow were tested separately.

The report flow remains agent submission followed by client access. Admin report approval and
revision-request actions are not part of the agreed flow; the existing report status values do not
imply that those admin actions are needed.

## Staging access and example-data limitation

The staging host is `https://bonafide-backend-cze7.onrender.com`. An unauthenticated read of
`GET /api/v1/client/verification-pricing/catalogue` returned:

```json
{
  "status": "error",
  "message": "No token provided"
}
```

The report examples below are therefore representative response shapes, **not real Basic,
Standard, or Premium staging reports**. To obtain real examples, call the protected endpoints
with a staging bearer token and request IDs for each tier.

An authenticated, read-only staging check on **2026-11-11** returned:

- `GET /api/v1/client/verification-requests/cmwc90bo6000ibshzgah4kvcf/quote`:
  HTTP `404`, `{"status":"error","message":"Premium quote not found."}`.
- `GET /api/v1/client/verification-requests/cmwc90bo6000ibshzgah4kvcf`:
  HTTP `404`, `{"status":"error","message":"Verification plan not selected."}`.
- `GET /api/v1/client/verification-pricing/catalogue`: HTTP `200`. The live values relevant to
  the frontend were:

```json
{
  "tiers": [
    {
      "code": "BASIC",
      "name": "Basic",
      "priceUsdCents": 2500,
      "priceNgnKobo": 3500000,
      "quoteRequired": false,
      "minQuoteUsdCents": null,
      "maxQuoteUsdCents": null
    },
    {
      "code": "STANDARD",
      "name": "Standard",
      "priceUsdCents": 6000,
      "priceNgnKobo": 8400000,
      "quoteRequired": false,
      "minQuoteUsdCents": null,
      "maxQuoteUsdCents": null
    },
    {
      "code": "PREMIUM",
      "name": "Premium",
      "priceUsdCents": null,
      "priceNgnKobo": null,
      "quoteRequired": true,
      "minQuoteUsdCents": 10000,
      "maxQuoteUsdCents": 20000
    }
  ],
  "monitoringPlans": [
    {
      "code": "WEEKLY",
      "name": "Weekly Monitoring",
      "priceUsdCents": 3500,
      "priceNgnKobo": 4900000,
      "intervalCount": 1,
      "checksPerPeriod": 1,
      "reportsPerPeriod": 1
    },
    {
      "code": "MONTHLY",
      "name": "Monthly Monitoring",
      "priceUsdCents": 6000,
      "priceNgnKobo": 8400000,
      "intervalCount": 1,
      "checksPerPeriod": 2,
      "reportsPerPeriod": 1
    },
    {
      "code": "QUARTERLY",
      "name": "Quarterly Monitoring",
      "priceUsdCents": 20000,
      "priceNgnKobo": 28000000,
      "intervalCount": 3,
      "checksPerPeriod": 3,
      "reportsPerPeriod": 1
    }
  ],
  "pricingSettings": {
    "version": 1,
    "usdToNgnRate": "1400",
    "roundingRule": "NEAREST_KOBO",
    "active": true
  }
}
```

The quote GET result is expected when no quote has been created with POST `/quote`. The request
detail 404 shows the deployed staging endpoint still reports “Verification plan not selected”
for this request. The local compatibility change described below is not evidence that the staging
deployment has been updated.

### Staging write-flow verification

With explicit authorization, the following flow was tested against staging on **2026-11-11** for
request `cmwc90bo6000ibshzgah4kvcf`. Premium was selected with monitoring disabled; no payment or
admin quote issuance was performed.

`PATCH /api/v1/client/verification-requests/cmwc90bo6000ibshzgah4kvcf/pricing` with
`verificationTierId=cmw4wiybj0003z0lpzwf2fme9`, `monitoringPlanId=null`, and
`recurringConsent=false` returned HTTP `200`:

```json
{
  "status": "success",
  "message": "Verification request pricing updated successfully",
  "data": {
    "id": "cmwc90bo6000ibshzgah4kvcf",
    "status": "QUOTE_REQUIRED",
    "verificationTierId": "cmw4wiybj0003z0lpzwf2fme9",
    "monitoringPlanId": null,
    "recurringConsent": false
  }
}
```

Then `POST /api/v1/client/verification-requests/cmwc90bo6000ibshzgah4kvcf/quote` with `{}` returned
HTTP `201`:

```json
{
  "id": "cmwca0wjw000pbshz3hqxyskc",
  "verificationRequestId": "cmwc90bo6000ibshzgah4kvcf",
  "status": "REQUESTED",
  "submittedAt": "2026-11-11T15:31:17.324Z"
}
```

A follow-up `GET /api/v1/client/verification-requests/cmwc90bo6000ibshzgah4kvcf/quote` returned HTTP
`200`, confirming quote `cmwca0wjw000pbshz3hqxyskc` in `REQUESTED` status. Amount, conversion rate,
expiry, and accepted time were `null`, as expected before admin issuance. This confirms the
staging PATCH and quote-request POST work for this request. It does not test admin issuance,
client acceptance, or payment checkout.

## Premium quote flow

The full flow starts when the client books a verification and ends when the admin issues the
quote. Continue using the same verification request ID throughout.

### 1. Client creates the booking

```http
POST /api/v1/client/verification-requests
Authorization: Bearer <client-token>
Content-Type: application/json
```

```json
{
  "verificationTypeId": "verification-type-id",
  "details": {
    "propertyType": "Residential",
    "propertyAddress": "12 Example Road, Lagos"
  },
  "additionalNote": "Optional note"
}
```

`details` fields depend on the verification type. This creates a `DRAFT` request and returns its
`id`; the create endpoint does not select a pricing tier.

### 2. Client selects Premium on the booking

Use the returned request ID:

```http
PATCH /api/v1/client/verification-requests/{id}/pricing
Authorization: Bearer <client-token>
Content-Type: application/json
```

```json
{
  "verificationTierId": "premium-tier-id",
  "monitoringPlanId": null,
  "recurringConsent": false
}
```

This returns `QUOTE_REQUIRED` for Premium. If monitoring is selected, recurring consent must be
true.

### 3. Client submits the quote request

```http
POST /api/v1/client/verification-requests/{id}/quote
Authorization: Bearer <client-token>
Content-Type: application/json
```

Send the property's intended use and, optionally, client notes. The backend requires intended use
either in this body or already saved on the verification request, persists it for the feasibility
report, and stores the notes on the request's `additionalNote` field:

```json
{
  "intendedUse": "Residential rental investment",
  "notes": "Please include a valuation of the existing structure."
}
```

The backend creates a `REQUESTED` quote and returns its quote ID.

### 4. Admin issues the quote

```http
POST /api/v1/admin/verification-requests/{id}/quote
Authorization: Bearer <admin-token>
Content-Type: application/json
```

```json
{
  "amountUsdCents": 15000,
  "scopeSummary": "Valuation and feasibility assessment",
  "expiresAt": "2026-11-25T12:00:00.000Z"
}
```

The amount must be inside the Premium range returned by the catalogue. The backend calculates
NGN using the active rate, changes the quote from `REQUESTED` to `ISSUED`, and queues an email
with a link to the client quote screen. The client must refresh/read that screen with
`GET /api/v1/client/verification-requests/{id}/quote`.

The backend requires an explicit `expiresAt`; it does not apply the frontend's two-week default.
`scopeSummary` is saved on the quote and returned by the client quote read. If omitted, the client
quote read falls back to the Premium tier description. An internal admin note is not supported.
The email review link uses `CLIENT_APP_URL` from the backend environment; it appends
`/verification-requests/{id}/quote` to that base URL.

### Frontend screens to add for Premium quotes

The current admin request-details page does not expose a quote action, and the admin Pricing
screen only edits the Premium quote range. Add the following UI using the quote APIs above:

1. **Admin Premium quote requests queue** — add a Quotes entry in the admin navigation (or a
   clearly discoverable quote-request filter in Verification Requests). List requests whose
   latest quote is `REQUESTED`, with request/property reference, client, submitted date, and an
   **Issue quote** action. Include loading, empty, and error states. Open the existing request
   details page for the selected request; do not make a second quote record just to display it.
2. **Admin request-details quote panel and issue form** — show the quote request's intended use
   and client notes, then collect:
   - **Amount (USD):** display dollars to the admin but send `amountUsdCents` as an integer number
     of cents. Show the configured Premium minimum and maximum from `GET /api/v1/admin/pricing`
     and reject amounts outside that range before submission.
   - **Scope summary:** client-facing description of what the Premium verification covers.
   - **Expiry date and time:** required by the API; do not rely on an implicit two-week default.

   Preview the NGN conversion using the active rate when available, but treat the backend response
   as authoritative. Submit to `POST /api/v1/admin/verification-requests/{id}/quote`. On success,
   show the issued amount in both currencies, conversion rate, expiry, and `ISSUED` status. For an
   already-issued quote, show its details instead of presenting it as a new request.
3. **Client quote review screen** — provide or reuse the route ending in
   `/verification-requests/{id}/quote`, which is also the route linked from the quote email. Read
   with `GET /api/v1/client/verification-requests/{id}/quote`; show the scope, USD and NGN amounts,
   expiry, and an **Accept quote** action. On acceptance, open the returned
   `payment.checkoutUrl`. Handle loading, not-found/not-yet-issued, expired, and payment errors.

The admin form must not create the client's quote request: that is the client-side
`POST /api/v1/client/verification-requests/{id}/quote` step. If no quote has been requested yet,
the admin issue endpoint returns `404` (`Premium quote request not found.`); show that state and
direct the client to submit the Premium request first.

**Email delivery caveat:** the supplied ZeptoMail logs report `TM_3601` / `SMI_115` (trial
account's 100-per-day sending limit exhausted) and show `VERIFICATION_REQUEST_CREATED` delivery
jobs failing after retries. This is a provider/account sending limit, not a quote-form validation
error. The quote endpoint currently reports email as `QUEUED`; that is not proof the email was
delivered, and the frontend cannot query final delivery status through this endpoint. After issuing
a quote, tell the admin it was issued and email was queued—not that it was delivered—and keep the
client quote screen reachable independently of email. The ZeptoMail sending quota/account must be
resolved separately for email notifications to resume.

### 5. Client reviews and accepts

The client reads the issued quote at `GET /api/v1/client/verification-requests/{id}/quote`, then
accepts it:

```http
POST /api/v1/client/verification-requests/{id}/quote/accept
Authorization: Bearer <client-token>
Content-Type: application/json
```

```json
{
  "quoteId": "quote-id-from-get"
}
```

Acceptance requires an issued, unexpired quote. It starts checkout based on the client's saved
country (`NG` → Paystack/NGN; other supported countries → Stripe/USD). The response contains
`payment.checkoutUrl`, which the frontend should open.

### Current implementation gaps

- An expired quote cannot currently be reissued through this flow: the backend rejects acceptance
  after expiry but does not automatically mark the quote `EXPIRED`; the admin issue endpoint only
  issues a `REQUESTED` quote.
- There is no separate internal admin note field.

The sections below give the current request/read response details and staging test results.

Use the same verification request ID throughout the flow:

1. Select the Premium tier with
   `PATCH /api/v1/client/verification-requests/{id}/pricing`.
2. Create a quote request with
   `POST /api/v1/client/verification-requests/{id}/quote`.
3. An admin issues the quote with
   `POST /api/v1/admin/verification-requests/{id}/quote`.
4. Read the quote with `GET /api/v1/client/verification-requests/{id}/quote`.
5. Accept it with `POST /api/v1/client/verification-requests/{id}/quote/accept`.
6. On success, use the returned `payment.checkoutUrl` to continue to Stripe or Paystack.

`GET .../quote` reads an existing quote; it does not create one. If the client has not called
`POST .../quote`, a “Premium quote not found” response is expected. The quote request currently
requires the request to have the Premium tier selected and to be in the quote-required state.

### Current payloads and behavior

Client quote request:

```http
POST /api/v1/client/verification-requests/{id}/quote
Authorization: Bearer <token>
Content-Type: application/json
```

The client may send intended use and notes in the request body. Intended use is required either in
this body or already saved on the verification request; the backend persists it for the feasibility
report. Notes, when provided, are saved as the request's `additionalNote`.

Admin quote issuance:

```json
{
  "amountUsdCents": 15000,
  "scopeSummary": "Valuation and feasibility assessment",
  "expiresAt": "2026-11-25T12:00:00.000Z"
}
```

`amountUsdCents` must be within the configured Premium quote range and `expiresAt` must be
supplied. The backend calculates the NGN amount using the active pricing settings, queues an email,
and returns both amounts, the rate/version, expiry, and notification status. The backend does not
apply the frontend's two-week-default expiry automatically. `scopeSummary` is saved on the quote
and returned by the client quote GET; when omitted, the response falls back to the Premium tier
description. An admin internal note is not supported.

Client quote GET currently returns this shape (the scope summary is the text saved by the admin,
or the Premium tier description when no custom scope was supplied):

```json
{
  "id": "quote-id",
  "verificationRequestId": "request-id",
  "status": "ISSUED",
  "amountUsdCents": 15000,
  "amountNgnKobo": 22500000,
  "ngnConversionRate": "1500",
  "ngnRateVersion": 3,
  "scopeSummary": "Valuation and feasibility assessment",
  "expiresAt": "2026-11-25T12:00:00.000Z",
  "acceptedAt": null
}
```

The values above are illustrative, not live staging data. Quote status uses the quote lifecycle
(`REQUESTED`, `ISSUED`, `ACCEPTED`, `EXPIRED`, `CANCELLED`).

**Expiry behavior caveat:** the backend rejects acceptance when an issued quote's `expiresAt` is
in the past, but does not automatically change its status from `ISSUED` to `EXPIRED`. The current
admin issue handler only issues `REQUESTED` quotes, and the client quote-request flow treats an
existing `ISSUED` quote as still in progress. Therefore, the frontend statement that expired quotes
are marked `EXPIRED` and an admin can then issue a new quote is **not currently supported by the
backend**; this needs a backend lifecycle/reissue change.

Quote acceptance requires:

```json
{
  "quoteId": "quote-id"
}
```

The backend chooses Paystack/NGN for country `NG` and Stripe/USD otherwise, based on the client's
saved profile country. The response includes the accepted quote and a `payment` object containing
`provider`, `currency`, `checkoutUrl`, `reference`, `transactionId`, and `status`.

## Verification request detail after selecting new pricing

The legacy request-detail API is
`GET /api/v1/client/verification-requests/{id}`. After selecting tier-based pricing, `plan` is
`null`; the new pricing selection is returned separately:

```json
{
  "id": "request-id",
  "status": "QUOTE_REQUIRED",
  "verificationType": { "name": "Property Verification" },
  "details": { "propertyAddress": "12 Example Road" },
  "plan": null,
  "pricing": {
    "verificationTier": {
      "id": "premium-tier-id",
      "code": "PREMIUM",
      "name": "Premium",
      "description": "Premium verification",
      "priceUsdCents": null,
      "quoteRequired": true
    },
    "monitoringPlan": null,
    "recurringConsent": false
  },
  "createdAt": "2026-11-11T12:00:00.000Z"
}
```

This `pricing` response is the updated backend contract for tier-based requests; legacy
`verificationPlan` requests continue to return their existing non-null `plan`.

## Pricing catalogue and package bullets

The client catalogue is `GET /api/v1/client/verification-pricing/catalogue`. It returns an
envelope with `status`, `message`, and `data`. `data` contains:

- `tiers`: active tier records, including `code`, `name`, `description`, `priceUsdCents`,
  `quoteRequired`, `minQuoteUsdCents`, `maxQuoteUsdCents`, and calculated `priceNgnKobo`.
- `monitoringPlans`: active monitoring plan records and calculated `priceNgnKobo`.
- `pricingSettings`: the active rate/version and rounding settings, or `null` if none is active.

Premium has no fixed `priceUsdCents` or `priceNgnKobo`; use `quoteRequired` and the optional
`minQuoteUsdCents`/`maxQuoteUsdCents` for quote messaging. Each tier also returns a configured
`features: string[]` list for package bullets.

The admin equivalent is `GET /api/v1/admin/pricing`. It uses the same catalogue data shape and
requires an admin bearer token. `PATCH /api/v1/admin/pricing` accepts
`tiers: [{ "id": "<premium-tier-id>", "minQuoteUsdCents": 10000, "maxQuoteUsdCents": 20000 }]`
to edit the Premium quote range (USD cents).

## Full client report: fields and checklist semantics

The full report endpoint is
`GET /api/v1/client/verification-requests/{id}/report/full`. Its response is an envelope; the
report payload is in `data`. It includes `reviewStatus`, `findings`, `verificationTier`,
`subscriptionPeriod`, `checklist`, `reportDocument`, and `photos`, as well as client/property
details and feedback.

For tiered reports:

- `findings` may be a tiered object keyed by section, or a legacy array.
- `verificationTier` is populated from the report's saved package snapshot; older reports without
  a snapshot fall back to the request's current tier.
- `summary` uses the saved report summary, or a generated checklist-completion summary when an
  older report has no summary. This generated text describes checklist completion only; it does not
  assert that a property's title, court records, valuation, or other findings are verified.
- Checklist entries can contain `label`, `status`, `sectionKey`, `result`, and `media`.
- Checklist `status` values are `PENDING` and **`COMPLETE`** (not `COMPLETED`).
- Checklist media is returned as `{ "url": "...", "fileName": "..." }`.
- Feasibility `assumptions` and `constraints` are plain strings, not arrays.
- Outcomes are free-form text. There is no backend enum such as `PASSED`, `FLAGGED`, or
  `FAILED`; the frontend should not rely on a finite set of values for color mapping.

Representative feasibility section:

```json
{
  "key": "feasibility",
  "result": {
    "outcome": "Free-form text",
    "assumptions": "Plain-text assumptions",
    "constraints": "Plain-text constraints"
  }
}
```

The current section definitions are not fully aligned with the documented package scopes:

| Tier     | Current sections returned by the checklist builder                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic    | Physical verification, court/crime verification, title deeds/documentation verification, valuation verification, amenities/environment verification |
| Standard | All Basic sections, plus land registry check, court records search, and local intelligence                                                          |
| Premium  | All Standard sections, plus property valuation and feasibility                                                                                      |

Section result field types currently support only `text` and `number`. Premium valuation fields are
`amount` (number), `currency` (text), `basis` (text), and `comparableEvidence` (text). Feasibility
fields are `outcome`, `assumptions`, and `constraints` (all text). There is no `textarea`,
`currency`, `select`, or `options` field type in the backend schema.

Each agent checklist section includes `requiresMedia: boolean` and `mediaType`, currently `PHOTO`
or `DOCUMENT`, so the frontend can choose the right upload button without inferring from the
section label. This indicates the expected upload kind; the upload endpoint continues to accept
files under `media`.

## Report access and workflow

The existing agent-facing report endpoints are:

- `GET /api/v1/admin/verification/agent-assignments/{id}/report` returns a report view for the
  caller's assignment. It is not a general report-ID lookup, and a recurring assignment may be
  deleted after submission.
- `GET /api/v1/admin/verification/agents/reports` lists reports for the caller's verification
  agent record. `reviewStatus=ALL` includes pending reports; accepted filter values are `ALL`,
  `APPROVED`, and `REVISION_REQUESTED`. The handler requires an agent record.
- `GET /api/v1/admin/verification/agents/reports/{id}` reads a report by report ID for the
  caller's own agent record.

Reports continue through the existing agent-submission and client-reading flow. There is no
admin-wide report lookup or approval/revision action, by agreement; neither is required for the
frontend checklist. The data model's `reviewStatus` values do not change this workflow.

## Backend source references

These are repository references for backend maintainers; the frontend handoff above is
self-contained:

- Premium quote/pricing plan and intended package scope:
  [`docs/verification-pricing-subscriptions-implementation.md`](./verification-pricing-subscriptions-implementation.md)
- Quote selection, request, issue, read, and accept handlers:
  [`src/api/client/verification/handlers/post-verification-request-quote/post-verification-request-quote.v1.ts`](../src/api/client/verification/handlers/post-verification-request-quote/post-verification-request-quote.v1.ts),
  [`src/api/client/verification/handlers/get-verification-request-quote/get-verification-request-quote.v1.ts`](../src/api/client/verification/handlers/get-verification-request-quote/get-verification-request-quote.v1.ts),
  [`src/api/client/verification/handlers/accept-verification-request-quote/accept-verification-request-quote.v1.ts`](../src/api/client/verification/handlers/accept-verification-request-quote/accept-verification-request-quote.v1.ts),
  [`src/api/admin/verification/handlers/issue-verification-request-quote/issue-verification-request-quote.v1.ts`](../src/api/admin/verification/handlers/issue-verification-request-quote/issue-verification-request-quote.v1.ts)
- Report response schema and routes:
  [`src/api/client/verification/index.ts`](../src/api/client/verification/index.ts),
  [`src/api/client/verification/handlers/get-verification-request-full-report/get-verification-request-full-report.v1.ts`](../src/api/client/verification/handlers/get-verification-request-full-report/get-verification-request-full-report.v1.ts)
- Tier report sections and client serialization:
  [`src/api/services/verification-report-sections.ts`](../src/api/services/verification-report-sections.ts),
  [`src/api/services/client-verification-report.ts`](../src/api/services/client-verification-report.ts)
- Admin report schemas and routes:
  [`src/api/admin/verification/index.ts`](../src/api/admin/verification/index.ts)
- Client/admin pricing catalogues:
  [`src/api/client/verification/handlers/get-verification-pricing-catalog/get-verification-pricing-catalog.v1.ts`](../src/api/client/verification/handlers/get-verification-pricing-catalog/get-verification-pricing-catalog.v1.ts),
  [`src/api/admin/verification/handlers/get-pricing-catalog/get-pricing-catalog.v1.ts`](../src/api/admin/verification/handlers/get-pricing-catalog/get-pricing-catalog.v1.ts)

## Focused test results

The following local Jest suites passed on **2026-11-11**:

- `src/tests/api/client/verification/verification-request-quote-notification-unit.test.ts`:
  4 passed. This suite directly tests the admin quote-issuance handler's queued email and the
  client's quote-acceptance checkout routing (Paystack for NG, Stripe otherwise).
- `src/tests/api/admin/verification/patch-pricing-catalog/patch-pricing-catalog-unit.test.ts`:
  4 passed. Covers admin catalogue updates/provider synchronization; it does not test quote
  issuance.
- `src/tests/jobs/notifications/event-handlers.test.ts`: 19 passed, including issued/accepted
  Premium quote notifications.

There is no dedicated test file under the admin verification tests for the Premium quote-issuance
endpoint. The first suite above invokes the admin issuance handler directly, but does not test the
HTTP route/middleware against a database or staging.
