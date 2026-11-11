# Frontend handoff: verification pricing, reports, and admin review

This note summarizes the backend contract and current gaps for the frontend. Paths below include
the `/api/v1` prefix.

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

The current handler does not read or persist a request body. Intended-use and note fields sent by
the frontend are currently ignored.

Admin quote issuance:

```json
{
  "amountUsdCents": 15000,
  "scopeSummary": "Valuation and feasibility assessment",
  "expiresAt": "2026-11-25T12:00:00.000Z"
}
```

`amountUsdCents` must be a positive number and `expiresAt` must be supplied. The backend calculates
the NGN amount using the active pricing settings, queues an email, and returns both amounts, the
rate/version, expiry, and notification status. The backend does not apply the frontend's
two-week-default expiry automatically. Although `scopeSummary` is accepted on issuance, it is not
stored in the quote; the client quote GET response currently uses the Premium tier description
instead. An admin internal note is not supported.

Client quote GET currently returns this shape:

```json
{
  "id": "quote-id",
  "verificationRequestId": "request-id",
  "status": "ISSUED",
  "amountUsdCents": 15000,
  "amountNgnKobo": 22500000,
  "ngnConversionRate": "1500",
  "ngnRateVersion": 3,
  "scopeSummary": "Premium tier description",
  "expiresAt": "2026-11-25T12:00:00.000Z",
  "acceptedAt": null
}
```

The values above are illustrative, not live staging data. Quote status uses the quote lifecycle
(`REQUESTED`, `ISSUED`, `ACCEPTED`, `EXPIRED`, `CANCELLED`).

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
`minQuoteUsdCents`/`maxQuoteUsdCents` for quote messaging. The catalogue does **not** return
`features: string[]`. Tier descriptions are available, but structured package bullet lists are not;
frontend-maintained bullets will need frontend updates when package scope changes.

The admin equivalent is `GET /api/v1/admin/pricing`. It uses the same catalogue data shape and
requires an admin bearer token. Premium's stored quote range may be present in the tier record,
but there is no separate quote-range editing field in the current pricing update handler.

## Full client report: fields and checklist semantics

The full report endpoint is
`GET /api/v1/client/verification-requests/{id}/report/full`. Its response is an envelope; the
report payload is in `data`. It includes `reviewStatus`, `findings`, `verificationTier`,
`subscriptionPeriod`, `checklist`, `reportDocument`, and `photos`, as well as client/property
details and feedback.

For tiered reports:

- `findings` may be a tiered object keyed by section, or a legacy array.
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

Each section specifies only `requiresMedia: boolean`; it does not declare whether the media should
be a photo, video, or document. The upload route accepts files under `media` and does not provide
a media-kind contract for the frontend to use.

## Admin report-review endpoints

The following are present:

- `GET /api/v1/admin/verification/agent-assignments/{id}/report` returns a report view for the
  caller's assignment. It is not a general report-ID lookup, and a recurring assignment may be
  deleted after submission.
- `GET /api/v1/admin/verification/agents/reports` lists reports for the caller's verification
  agent record. `reviewStatus=ALL` includes pending reports; accepted filter values are `ALL`,
  `APPROVED`, and `REVISION_REQUESTED`. The handler requires an agent record, so this is not a
  reliable admin-wide review queue.
- `GET /api/v1/admin/verification/agents/reports/{id}` reads a report by report ID for the
  caller's own agent record.

The requested general admin endpoints `GET /admin/verification/reports/{id}` and
`GET /admin/verification/agent-assignments/{id}/report` as a general admin review lookup are not
implemented. There is also no endpoint found to approve a report or request revisions. Although
the data model has `reviewStatus` values `PENDING`, `APPROVED`, and `REVISION_REQUESTED`, the
frontend cannot currently perform those review actions through an API.

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
