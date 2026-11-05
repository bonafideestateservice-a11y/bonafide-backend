# Verification Packages and Monitoring: Frontend/API Contract

**Status: Mixed contract.** Existing endpoint shapes are noted where implemented; proposed
features are called out explicitly. Subscription terms and package prices require management
approval before production use.

All paths include `/api/v1`. Examples show the JSON response body, not an additional wrapper,
unless the endpoint already returns a wrapper. Existing endpoints should retain their current
response shape where needed for compatibility. Use the existing API error response on failures.

## Frontend flow changes

1. Read the client's `countryCode` from `GET /api/v1/client/profile`. The frontend decides which
   returned price to display: Nigeria (`NG`) displays NGN; other supported countries display USD.
   If no country is set, ask the client to select one and save it with
   `PATCH /api/v1/client/profile` before checkout.
2. Replace the single frequency-based plan choice with a verification package choice followed
   by optional monitoring selection. Basic cannot have monitoring.
3. Keep Premium payment disabled until a quote is issued and accepted.
4. The catalogue returns both USD and NGN values. The frontend selects the display currency from
   profile `countryCode`; do not make a client-side exchange-rate calculation. The backend still
   validates the matching currency/provider at payment initialization. For NGN, show the
   configured rate and conversion note.
5. Before redirecting to a provider, show the package amount, first monitoring-period amount
   (if selected), total, and country-selected currency. Never calculate or submit the
   authoritative charge amount in the frontend.
6. On return from checkout, treat the redirect as a return signal, not proof of payment.
   Refresh the request and render its payment status after the provider webhook updates it.
7. Add monitoring status, period dates, included/completed site visits, visit statuses, report
   status, and cancellation state to the client's request/tracking views.
8. Give admins pricing, provider-sync, quote, and assignment views. Give agents a checklist
   generated for the assigned package and paid period. Each required site visit is its own
   "Physical/site visit" checklist item, and completing it updates that period's matching visit
   record. Keep internal staff details off client package and report responses.

### Roles

- **Public:** package catalogue.
- **Client:** authenticated request, quote, payment, monitoring, and report routes.
- **Admin:** authenticated admin role for pricing, quote issuance, and assignment routes.
- **Agent/admin:** existing assignment routes protected by the repository's agent/admin
  middleware.
- **Provider webhooks:** server-to-server only; the frontend must never call them.

## 1. Package selection and verification request

### `GET /api/v1/client/verification-packages` — add, or adapt the existing plans route

Public. No query parameters required. It returns both USD and NGN prices regardless of the
viewer's country. The frontend reads the authenticated user's `countryCode` from `GET
/api/v1/client/profile` and chooses which price to display: `NG` displays NGN; other supported
countries display USD. This display choice is frontend behavior; the catalogue API does not
select or hide a currency. The backend independently enforces the supported country/provider
combination during payment initialization. The current
`GET /api/v1/client/verification-types/:slug/plans` can remain as a legacy response during
migration; the new package screen should consume this richer catalogue.

**Response**

```json
{
  "verificationType": {
    "id": "type_property",
    "slug": "property-verification",
    "name": "Property verification"
  },
  "packages": [
    {
      "id": "tier_basic",
      "code": "BASIC",
      "name": "Basic",
      "description": "One site visit, brief local enquiries, media where needed, and a short report.",
      "priceUsdCents": 2500,
      "priceNgnKobo": 3750000,
      "quoteRequired": false,
      "active": true,
      "monitoringAvailable": false
    },
    {
      "id": "tier_standard",
      "code": "STANDARD",
      "name": "Standard",
      "description": "Basic checks plus registry, court-records, and local-intelligence checks.",
      "priceUsdCents": 6000,
      "priceNgnKobo": 9000000,
      "quoteRequired": false,
      "active": true,
      "monitoringAvailable": true
    },
    {
      "id": "tier_premium",
      "code": "PREMIUM",
      "name": "Premium",
      "description": "Standard checks plus property valuation and intended-use feasibility.",
      "priceUsdCents": null,
      "priceNgnKobo": null,
      "quoteRequired": true,
      "quoteRange": {
        "minimum": {
          "usdCents": 10000,
          "ngnKobo": 15000000
        },
        "maximum": {
          "usdCents": 20000,
          "ngnKobo": 30000000
        }
      },
      "active": true,
      "monitoringAvailable": true
    }
  ],
  "monitoringPlans": [
    {
      "id": "monitor_weekly",
      "code": "WEEKLY",
      "name": "Weekly",
      "priceUsdCents": 3500,
      "priceNgnKobo": 5250000,
      "interval": "week",
      "checksPerPeriod": 1,
      "reportsPerPeriod": 1,
      "active": true
    },
    {
      "id": "monitor_monthly",
      "code": "MONTHLY",
      "name": "Monthly",
      "priceUsdCents": 6000,
      "priceNgnKobo": 9000000,
      "interval": "month",
      "checksPerPeriod": 2,
      "reportsPerPeriod": 1,
      "active": true
    },
    {
      "id": "monitor_quarterly",
      "code": "QUARTERLY",
      "name": "Quarterly",
      "priceUsdCents": 20000,
      "priceNgnKobo": 30000000,
      "interval": "3 months",
      "checksPerPeriod": 3,
      "reportsPerPeriod": 1,
      "active": true
    }
  ],
  "paymentOptions": [
    {
      "provider": "STRIPE",
      "currency": "USD",
      "enabled": true
    },
    {
      "provider": "PAYSTACK",
      "currency": "NGN",
      "enabled": true
    }
  ],
  "exchangeRate": {
    "baseCurrency": "USD",
    "quoteCurrency": "NGN",
    "rate": "1500.00",
    "version": "rate_v3",
    "effectiveAt": "2026-11-04T12:00:00.000Z",
    "rounding": "HALF_UP_TO_WHOLE_NAIRA"
  },
  "checkoutNotes": {
    "USD": "Prices are displayed in US dollars.",
    "NGN": "Naira prices are converted from USD using the current exchange rate. Your final NGN total is shown before payment."
  }
}
```

The example's NGN values are derived using its displayed `exchangeRate`, and illustrate the
proposed catalogue only; do not treat them as approved launch prices. The catalogue's canonical
editable prices are USD. NGN values are calculated by the server using the configured rate and
rounding rule and should not be independently edited as tier or monitoring prices. Return both
currency values to support country-based display, but do not return provider secrets, inactive
provider price IDs, or internal assignments.

### `POST /api/v1/client/verification-requests` — change

Client auth. Keep the existing property `details` contract and add the package and optional
monitoring selection. A consent timestamp is recorded by the server; the client sends a consent
affirmation, not a timestamp.

**Request**

```json
{
  "verificationTypeId": "type_property",
  "details": {
    "propertyAddress": "12 Example Road, Lagos, Nigeria",
    "intendedUse": "Residential"
  },
  "additionalNote": "Please verify the title documents.",
  "verificationTierId": "tier_standard",
  "monitoringPlanId": "monitor_monthly",
  "recurringConsent": true
}
```

For no monitoring, send `"monitoringPlanId": null` and `"recurringConsent": false`. Reject
monitoring for Basic and reject monitoring selection without consent. Premium can be selected
without an accepted quote, but it cannot be paid before quote acceptance.

**Response — `201 Created`**

```json
{
  "id": "request_123",
  "status": "DRAFT",
  "verificationType": {
    "id": "type_property",
    "slug": "property-verification"
  },
  "verificationTier": {
    "id": "tier_standard",
    "code": "STANDARD",
    "name": "Standard"
  },
  "monitoringPlan": {
    "id": "monitor_monthly",
    "code": "MONTHLY",
    "checksPerPeriod": 2,
    "reportsPerPeriod": 1
  },
  "recurringConsent": {
    "given": true,
    "recordedAt": "2026-11-04T12:10:00.000Z"
  },
  "quoteStatus": null,
  "createdAt": "2026-11-04T12:10:00.000Z"
}
```

### `PATCH /api/v1/client/verification-requests/:id/plan` — change compatibly

Client auth. Accept the new package/monitoring selection before successful payment. Keep
accepting the legacy `verificationPlanId` for existing clients during the compatibility period;
do not reinterpret its meaning for old clients.

**Request**

```json
{
  "verificationTierId": "tier_standard",
  "monitoringPlanId": "monitor_weekly",
  "recurringConsent": true
}
```

**Response — `200 OK`**

```json
{
  "id": "request_123",
  "status": "DRAFT",
  "verificationTier": {
    "id": "tier_standard",
    "code": "STANDARD",
    "name": "Standard",
    "priceUsdCents": 6000
  },
  "monitoringPlan": {
    "id": "monitor_weekly",
    "code": "WEEKLY",
    "priceUsdCents": 3500,
    "checksPerPeriod": 1,
    "reportsPerPeriod": 1
  },
  "recurringConsent": {
    "given": true,
    "recordedAt": "2026-11-04T12:15:00.000Z"
  },
  "quoteStatus": null
}
```

Return `409 Conflict` if payment has already succeeded or the request is no longer editable.

### `GET /api/v1/client/verification-requests/:id` — change

Client auth. Keep existing request fields and add `verificationTier`, `monitoringPlan`,
`recurringConsent`, `quoteStatus`, latest payment status, and monitoring summary. This is the
client's request detail/refresh endpoint after checkout.

**Response — relevant fields**

```json
{
  "id": "request_123",
  "status": "SUBMITTED",
  "verificationTier": {
    "code": "STANDARD",
    "name": "Standard",
    "priceUsdCents": 6000,
    "priceNgnKobo": 9000000
  },
  "monitoringPlan": {
    "code": "MONTHLY",
    "checksPerPeriod": 2,
    "reportsPerPeriod": 1
  },
  "recurringConsent": {
    "given": true,
    "recordedAt": "2026-11-04T12:10:00.000Z"
  },
  "latestPayment": {
    "status": "SUCCESS",
    "purpose": "INITIAL_PURCHASE",
    "chargedAmountMinor": 9000000,
    "currency": "NGN"
  },
  "monitoring": {
    "status": "ACTIVE",
    "currentPeriod": {
      "startsAt": "2026-11-04T12:20:00.000Z",
      "endsAt": "2026-12-04T12:20:00.000Z",
      "checksIncluded": 2,
      "checksCompleted": 0,
      "reportStatus": "PENDING",
      "siteVisits": [
        {
          "id": "visit_123",
          "visitNumber": 1,
          "status": "PENDING",
          "completedAt": null
        },
        {
          "id": "visit_124",
          "visitNumber": 2,
          "status": "PENDING",
          "completedAt": null
        }
      ]
    },
    "cancelAtPeriodEnd": false
  }
}
```

Money fields use integer minor units and an ISO currency. Never recompute historical payment
amounts using current prices or exchange rates.

## 2. Premium quote flow

### `POST /api/v1/client/verification-requests/:id/quote` — add

Client auth. Submits a quote request for the Premium selection. `intendedUse` can be omitted
when already present in the request details.

**Request**

```json
{
  "intendedUse": "Residential redevelopment",
  "clientNotes": "Please include nearby comparable properties."
}
```

**Response — `201 Created`**

```json
{
  "id": "quote_123",
  "verificationRequestId": "request_123",
  "status": "REQUESTED",
  "submittedAt": "2026-11-04T12:20:00.000Z"
}
```

### `GET /api/v1/client/verification-requests/:id/quote` — add

Client auth; only the request owner can view it. No query parameters.

**Response — `200 OK`**

```json
{
  "id": "quote_123",
  "verificationRequestId": "request_123",
  "status": "ISSUED",
  "amountUsdCents": 15000,
  "amountNgnKobo": 22500000,
  "ngnConversionRate": "1500.00",
  "ngnRateVersion": "rate_v3",
  "scopeSummary": "Standard checks, valuation, and residential feasibility report.",
  "expiresAt": "2026-11-18T23:59:59.000Z",
  "acceptedAt": null
}
```

For `REQUESTED`, return the status with quote amount/expiry as `null`. Do not expose the issuing
admin's identity on the client response.

### `POST /api/v1/admin/verification-requests/:id/quote` — add

Admin auth. Issues an immutable Premium quote and emails the client a Bonafide-branded
notification linking to the authenticated quote review screen. The notification should show
both quote amounts and expiry, but no provider checkout link yet.

**Request**

```json
{
  "amountUsdCents": 15000,
  "scopeSummary": "Standard checks, valuation, and residential feasibility report.",
  "expiresAt": "2026-11-18T23:59:59.000Z",
  "internalNote": "Confirm comparable evidence availability."
}
```

**Response — `201 Created`**

```json
{
  "id": "quote_123",
  "verificationRequestId": "request_123",
  "status": "ISSUED",
  "amountUsdCents": 15000,
  "amountNgnKobo": 22500000,
  "ngnConversionRate": "1500.00",
  "ngnRateVersion": "rate_v3",
  "scopeSummary": "Standard checks, valuation, and residential feasibility report.",
  "expiresAt": "2026-11-18T23:59:59.000Z",
  "issuedAt": "2026-11-04T12:25:00.000Z",
  "notification": {
    "emailStatus": "QUEUED"
  }
}
```

The quote email links to `CLIENT_APP_URL/verification-requests/:id/quote`. Configure
`CLIENT_APP_URL` to the client application's HTTPS base URL.

The quote is issued and displayed in both currencies. The admin supplies the USD quote amount;
the server calculates its NGN equivalent from the exchange rate in effect at issuance and stores
both amounts plus that rate/version. Both quoted amounts remain fixed through acceptance and
expiry. The client's country determines which amount is displayed and charged: NG uses the
stored NGN amount; other supported countries use the stored USD amount. A later rate change
does not change an already issued quote.

### `POST /api/v1/client/verification-requests/:id/quote/accept` — add

Client auth. The request owner accepts the currently issued, unexpired quote; do not accept a
client-supplied amount. On acceptance, the backend records acceptance and creates an idempotent
provider-hosted checkout using the saved profile country (USD/Stripe for non-NG, NGN/Paystack
for NG), then emails the client the quote summary and hosted payment link. Creating the session
does not charge the client; the client must open the link and complete provider checkout. The
frontend only chooses which quote amount to display; it does not choose the provider or construct
the payment URL.

**Request**

```json
{
  "quoteId": "quote_123"
}
```

**Response — `200 OK`**

```json
{
  "id": "quote_123",
  "status": "ACCEPTED",
  "amountUsdCents": 15000,
  "amountNgnKobo": 22500000,
  "ngnConversionRate": "1500.00",
  "ngnRateVersion": "rate_v3",
  "acceptedAt": "2026-11-04T12:30:00.000Z",
  "expiresAt": "2026-11-18T23:59:59.000Z",
  "payment": {
    "status": "PENDING",
    "provider": "PAYSTACK",
    "currency": "NGN",
    "checkoutUrl": "https://checkout.paystack.com/example",
    "checkoutExpiresAt": null,
    "reference": "T482913650284",
    "transactionId": "transaction_123"
  },
  "notification": {
    "emailStatus": "QUEUED"
  }
}
```

For a non-Nigerian client, `payment.provider` is `STRIPE`, `payment.currency` is `USD`, and
`payment.checkoutUrl` is the Stripe Checkout URL. Only send the payment email after the provider
checkout URL has been created successfully. The email should identify Bonafide, show the
country-applicable quoted amount, and link directly to the hosted provider checkout. The
quote-issued email sent after admin issuance should instead link to the client's quote page so
they can review and accept; it must not claim payment is ready. If checkout creation or email
queueing fails, return an explicit error; quote acceptance remains recorded. Email delivery runs
through the notification workers, which retry transient provider failures and mark permanently
failed jobs. A repeated idempotent acceptance may reuse the pending provider session and enqueue
another email; the client can also use the existing payment initializer route to obtain a fresh
checkout if the hosted session expires.

## 3. Checkout summary and payment

### `GET /api/v1/client/verification-requests/:id/checkout-summary` — recommended addition

Client auth. This read-only endpoint lets the frontend display the exact server-calculated
amount before redirecting to checkout. No request body or query parameters. If not added,
extend the existing request-detail response to provide these fields with the same calculation
and snapshot rules.

**Response — `200 OK`**

```json
{
  "verificationRequestId": "request_123",
  "countryCode": "NG",
  "currency": "NGN",
  "provider": "PAYSTACK",
  "lineItems": [
    {
      "type": "VERIFICATION",
      "description": "Standard verification",
      "amountUsdCents": 6000,
      "amountNgnKobo": 9000000
    },
    {
      "type": "MONITORING",
      "description": "Monthly monitoring — first period",
      "amountUsdCents": 6000,
      "amountNgnKobo": 9000000
    }
  ],
  "totals": {
    "usdCents": 12000,
    "ngnKobo": 18000000
  },
  "charge": {
    "amountMinor": 18000000,
    "currency": "NGN",
    "display": "NGN 180,000"
  },
  "exchangeRate": {
    "baseCurrency": "USD",
    "quoteCurrency": "NGN",
    "rate": "1500.00",
    "version": "rate_v3",
    "rounding": "HALF_UP_TO_WHOLE_NAIRA"
  },
  "quote": null,
  "quotePricing": null,
  "recurringConsentRequired": true,
  "canInitializePayment": true
}
```

For a Premium request, include the accepted quote in `lineItems` in place of a fixed package
price. Its USD and NGN amounts must come from the issued quote snapshot, not today's exchange
rate. `quotePricing` should expose the quote's stored amounts and rate version, for example:

```json
{
  "amountUsdCents": 15000,
  "amountNgnKobo": 22500000,
  "ngnConversionRate": "1500.00",
  "ngnRateVersion": "rate_v3"
}
```

Return `canInitializePayment: false` and a reason if the quote is missing/expired, consent is
missing, or the request is not payable. Do not include provider secrets or inactive provider
price IDs. If monitoring is also selected, its NGN equivalent uses the current checkout rate;
the transaction snapshot must distinguish that from the locked quote conversion.

### Payment initializers — change, preserve both paths

#### `POST /api/v1/client/verification-requests/:id/payment/initialize-stripe`

#### `POST /api/v1/client/verification-requests/:id/payment/initialize-paystack`

Client auth; existing `Idempotency-Key` header required. No amount is accepted in the body.
The frontend calls the initializer consistent with the profile country; Stripe is for non-NG
profiles and Paystack for NG profiles, and the backend validates that mapping. A payment link
sent by email is the provider-hosted `checkoutUrl`; if that session has expired, send the client
back to the authenticated quote/request screen to request a fresh checkout through the existing
initializer.

**Request**

```http
POST /api/v1/client/verification-requests/request_123/payment/initialize-paystack
Authorization: Bearer <token>
Idempotency-Key: request_123-initial-payment-v1
Content-Type: application/json
```

No JSON body.

**Stripe response — `200 OK`**

```json
{
  "url": "https://checkout.stripe.com/example",
  "sessionId": "stripe_session_123",
  "transactionId": "txn_123",
  "reference": "stripe_session_123",
  "pricing": {
    "verificationAmountUsdCents": 6000,
    "monitoringFirstPeriodUsdCents": 6000,
    "totalUsdCents": 12000,
    "verificationAmountNgnKobo": 9000000,
    "monitoringFirstPeriodNgnKobo": 9000000,
    "totalNgnKobo": 18000000,
    "chargedAmountMinor": 12000,
    "currency": "USD"
  }
}
```

**Paystack response — `200 OK`**

```json
{
  "authorization_url": "https://checkout.paystack.com/example",
  "access_code": "access_123",
  "reference": "paystack_ref_123",
  "transactionId": "txn_123",
  "pricing": {
    "verificationAmountUsdCents": 6000,
    "monitoringFirstPeriodUsdCents": 6000,
    "totalUsdCents": 12000,
    "verificationAmountNgnKobo": 9000000,
    "monitoringFirstPeriodNgnKobo": 9000000,
    "chargedAmountMinor": 18000000,
    "currency": "NGN",
    "exchangeRate": "1500.00",
    "exchangeRateVersion": 3
  }
}
```

These are proposed extensions to the current checkout responses; preserve existing
`url`/`authorization_url` fields and pending-checkout idempotency behavior. Checkout amounts and
provider price IDs are resolved and snapshotted by the backend. Stripe uses a one-time line item
for the verification package and an optional recurring line item for monitoring. Paystack charges
the combined initial amount and attaches the selected monitoring plan for later renewals. Payment
success is confirmed only by the webhook and subsequent request refresh, never by the checkout
return URL.

## 4. Admin catalogue and rate management

All routes below require admin auth. The admin edits canonical USD prices; NGN equivalents are
server-calculated from the active rate and are not independently editable. Do not show a
successful save until provider sync and activation complete.

### `GET /api/v1/admin/pricing` — add

No request body. Returns current package/monitoring terms, rate, provider sync state, and
version identifiers.

**Response — `200 OK`**

```json
{
  "packages": [
    {
      "id": "tier_basic",
      "code": "BASIC",
      "priceUsdCents": 2500,
      "priceNgnKobo": 3750000,
      "active": true,
      "version": 2
    }
  ],
  "monitoringPlans": [
    {
      "id": "monitor_monthly",
      "code": "MONTHLY",
      "priceUsdCents": 6000,
      "priceNgnKobo": 9000000,
      "checksPerPeriod": 2,
      "reportsPerPeriod": 1,
      "active": true,
      "version": 3
    }
  ],
  "exchangeRate": {
    "rate": "1500.00",
    "version": "rate_v3",
    "effectiveAt": "2026-11-04T12:00:00.000Z"
  },
  "providerSync": [
    {
      "provider": "STRIPE",
      "status": "READY",
      "activeVersion": 3,
      "lastSyncedAt": "2026-11-04T12:00:00.000Z",
      "error": null
    },
    {
      "provider": "PAYSTACK",
      "status": "READY",
      "activeVersion": 3,
      "lastSyncedAt": "2026-11-04T12:00:00.000Z",
      "error": null
    }
  ]
}
```

### `PATCH /api/v1/admin/verification/pricing` — implemented

Update one or more fixed-price tiers, monitoring plans, and/or the USD-to-NGN rate in one request.
The backend stages corresponding Stripe prices and Paystack plans first, then activates the new
provider versions and catalogue values together. If any provider sync fails, the prior active
versions remain in place and the endpoint returns an error.

```json
{
  "usdToNgnRate": "1525.50",
  "tiers": [{ "id": "tier_standard", "priceUsdCents": 6500 }],
  "monitoringPlans": [{ "id": "monitor_monthly", "priceUsdCents": 6200 }]
}
```

All fields are optional, but the body must include at least one price update or an effective rate
change. Fixed-price tier and monitoring plan IDs must be active. Quote-required tiers cannot be
given a fixed price through this route. When changing a USD price, an active or supplied NGN rate
is required. When changing the rate, the server re-syncs every active fixed-price tier and
monitoring plan at that rate.

**Response — `200 OK`**

```json
{
  "status": "success",
  "message": "Pricing updated and synced to Stripe and Paystack for future checkouts.",
  "data": {
    "pricingSettings": {
      "usdToNgnRate": "1525.50"
    },
    "syncedTargets": 2,
    "existingSubscriptionsUpdated": false
  }
}
```

Existing Stripe and Paystack subscriptions are not repriced or migrated by this route; their
current provider subscription terms continue unchanged. New checkouts use the newly activated
provider price versions. Historical receipts and accepted quotes retain their snapshots.

## 5. Monitoring, assignments, and agent forms

### `POST /api/v1/client/verification-requests/:id/subscription/cancel` — add

Client auth. Cancels future renewals; the current paid period remains usable. No request body
is needed unless the product requires a cancellation reason.

**Response — `200 OK`**

```json
{
  "verificationRequestId": "request_123",
  "subscriptionId": "sub_123",
  "status": "CANCEL_AT_PERIOD_END",
  "cancelAtPeriodEnd": true,
  "currentPeriodEndsAt": "2026-12-04T12:20:00.000Z",
  "cancelledAt": "2026-11-04T13:10:00.000Z"
}
```

The client should show the cancellation effective date and that paid checks remain active
through the period end.

### `POST /api/v1/admin/verification-requests/:id/assign-agent` — change

Admin auth. The assignment is associated with its paid period. It covers all visits included in
that period; the assigned agent marks each visit complete from the report workflow.

**Request**

```json
{
  "agentId": "agent_123"
}
```

There is one assignment per paid period, not one assignment per visit.

**Response — `200 OK`**

```json
{
  "id": "assignment_123",
  "verificationRequestId": "request_123",
  "status": "ASSIGNED",
  "agent": {
    "id": "agent_123",
    "name": "Ada Okafor"
  },
  "createdAt": "2026-11-04T13:15:00.000Z"
}
```

### `POST /api/v1/admin/verification/agent-assignments/:id/start` — change

Agent/admin auth, existing route. Initializes the report checklist for the assigned package and
the assignment's paid subscription period. Site-visit checklist items are generated from that
period's `requiredSiteVisits`; each item represents one specific visit. The recurring plan
catalogue currently configures weekly as 1 visit, monthly as 2, and quarterly as 3, with one
report per period. Do not hard-code that mapping in the client: use the assignment response's
checklist and period data.

No request body.

**Response — `200 OK`**

```json
{
  "id": "assignment_123",
  "status": "ACCEPTED",
  "checklistItems": [
    {
      "id": "item_physical",
      "sectionKey": "site_visit_1",
      "label": "Physical/site visit 1",
      "status": "PENDING",
      "requiresMedia": true,
      "fields": [
        { "key": "visitOutcome", "label": "Visit outcome", "type": "text" },
        { "key": "notes", "label": "Site observations", "type": "text" }
      ]
    },
    {
      "id": "item_registry",
      "sectionKey": "land_registry_search",
      "label": "Land registry search",
      "status": "PENDING",
      "requiresMedia": true,
      "fields": [
        { "key": "outcome", "label": "Search outcome", "type": "text" },
        { "key": "reference", "label": "Search reference", "type": "text" }
      ]
    }
  ]
}
```

For a period that requires two visits, the response includes `site_visit_1` and `site_visit_2`
items, each with its own item ID, status, result, and media. A one-visit period uses the legacy
`site_visit` key. Render each as an individual visit form/card; do not make a separate report per
visit. The remaining tier-specific sections are shared by the period report. This start response
is for initializing the checklist; call `GET .../:id/checklist` after start (and on later screen
loads) to render persisted item statuses, results, media, and visit records. Do not treat the
start response's `status: "PENDING"` as the saved status of an existing item.

### `GET /api/v1/admin/verification/agent-assignments/:id/checklist` — change

Agent/admin auth, existing route. Return selected tier, site visit and period context, dynamic
required sections, saved form results, and media metadata. Read this endpoint when opening or
refreshing an assignment so the UI uses persisted state.

**Response — `200 OK`**

```json
{
  "assignmentId": "assignment_123",
  "verificationTier": "PREMIUM",
  "period": {
    "id": "period_123",
    "requiredSiteVisits": 2,
    "completedSiteVisits": 1,
    "siteVisits": [
      {
        "id": "visit_123",
        "visitNumber": 1,
        "status": "COMPLETED",
        "completedAt": "2026-11-04T13:40:00.000Z"
      },
      {
        "id": "visit_124",
        "visitNumber": 2,
        "status": "PENDING",
        "completedAt": null
      }
    ]
  },
  "checklist": [
    {
      "id": "item_visit_1",
      "sectionKey": "site_visit_1",
      "label": "Physical/site visit 1",
      "status": "PENDING",
      "result": null,
      "fields": [
        { "key": "visitOutcome", "label": "Visit outcome", "type": "text" },
        { "key": "notes", "label": "Site observations", "type": "text" }
      ],
      "media": []
    },
    {
      "id": "item_visit_2",
      "sectionKey": "site_visit_2",
      "label": "Physical/site visit 2",
      "status": "PENDING",
      "result": null,
      "fields": [
        { "key": "visitOutcome", "label": "Visit outcome", "type": "text" },
        { "key": "notes", "label": "Site observations", "type": "text" }
      ],
      "media": []
    }
  ],
  "progressPercent": 0
}
```

Each checklist item's `result` may be `null` until saved. The response also returns
`verificationTier`, `client`, `clientDocuments`,
`additionalNotes`, `payment`, `period`, and `progressPercent`; the example above is abbreviated.
Use `period.siteVisits` to map `visitNumber` and visit status to the numbered checklist item.

There is **no separate site-visit completion endpoint**. Completing a visit uses the checklist
update endpoint below; do not call or build UI for
`POST /api/v1/admin/verification/agent-assignments/:id/site-visits/:visitId/complete`.

In the agent UI, show each required visit as its own checklist card and show its matching
`period.siteVisits` status. The weekly/monthly/quarterly plan catalogue currently specifies
1/2/3 visits respectively, but render the backend-provided number of items rather than
hard-coding plan names or counts. Each paid period still has one report, submitted only after all
required visits and all other required checklist sections are complete.

### Client tracking response — monitoring details

`GET /api/v1/client/verification-requests/:id/tracking` returns the latest monitoring subscription
and paid period as `monitoring`, or `null` when the request is not monitored. The period includes
required/completed visit counts and each visit's status and schedule, without exposing internal
agent identifiers.

```json
{
  "monitoring": {
    "status": "ACTIVE",
    "plan": "MONTHLY",
    "currentPeriod": {
      "startsAt": "2026-11-04T12:20:00.000Z",
      "endsAt": "2026-12-04T12:20:00.000Z",
      "checksIncluded": 2,
      "checksCompleted": 1,
      "reportStatus": "PENDING",
      "siteVisits": [
        {
          "id": "visit_123",
          "visitNumber": 1,
          "status": "COMPLETED",
          "completedAt": "2026-11-04T13:40:00.000Z"
        },
        {
          "id": "visit_124",
          "visitNumber": 2,
          "status": "PENDING",
          "completedAt": null
        }
      ]
    },
    "cancelAtPeriodEnd": false
  }
}
```

### `PATCH /api/v1/admin/verification/agent-assignments/:id/checklist/:itemId` — change

Agent/admin auth, existing route. Keep multipart support for evidence uploads and add
section-specific structured results. `result` is a JSON-encoded string in multipart form data;
the JSON-only status update remains supported when no files are uploaded. For a site visit, use
the checklist item's `id` (not the `SiteVisit` record ID) and submit its own outcome, notes, and
evidence. The backend maps `site_visit_N` to visit number `N`. A `SiteVisit` is marked
`COMPLETED` and `period.completedSiteVisits` increments once when that item's status is
`COMPLETE`, all required fields are populated, and required media is attached. Saving status,
result, and media across separate requests is supported; completion takes effect when the
requirements are all satisfied. A cancelled or missing matching visit cannot be completed and
returns `409`.

**Request — `multipart/form-data`**

```text
status=COMPLETE
result={"visitOutcome":"ACCESSIBLE","notes":"Exterior inspected."}
media=<site visit photo>
```

**Response — `200 OK`**

```json
{
  "id": "item_visit_1",
  "label": "Physical/site visit 1",
  "sectionKey": "site_visit_1",
  "status": "COMPLETE",
  "result": {
    "visitOutcome": "ACCESSIBLE",
    "notes": "Exterior inspected."
  },
  "media": [
    {
      "id": "document_123",
      "url": "https://files.example/registry-proof.pdf",
      "fileName": "site-visit.jpg",
      "fileType": "image/jpeg",
      "fileSizeBytes": 2048
    }
  ]
}
```

For a JSON-only update, send `{ "status": "COMPLETE", "result": { ... } }`. Multipart `result`
must be a JSON-encoded form field. To update the visit record, the saved checklist state must
meet the section's completion requirements; setting `status=COMPLETE` alone is not enough for a
site visit because it also requires its report fields and media. Refresh the assignment checklist
to display the resulting `period.siteVisits` state and completed count.

### `POST /api/v1/admin/verification/agent-assignments/:id/report` — change

Agent/admin auth, existing route. Keep `report_document` as the uploaded PDF field. Validate
required tier-specific checklist fields and required site checks on the server. A single report
is submitted for the assignment's paid period, regardless of how many site-visit checklist items
the period includes. Do not produce the period report until all included visits and report
checklist sections are complete.

**Request — `multipart/form-data`**

```text
report_document=<PDF file>
additionalNotes=Detailed findings and recommendations.
```

**Response — `201 Created`**

```json
{
  "reportId": "report_123",
  "verificationRequestId": "request_123",
  "subscriptionPeriodId": "period_123",
  "status": "PENDING",
  "verificationTier": "STANDARD",
  "submittedAt": "2026-11-04T14:00:00.000Z"
}
```

If visits are incomplete, the endpoint responds `409` with
`{ "error": "INCOMPLETE_SITE_VISITS", "progressPercent": 50, "remainingSiteVisits": 1 }`.
The frontend should take the agent back to the outstanding visit checklist items. Other
incomplete checklist sections or report fields also return `409` with their respective error
details. After the report is submitted, the recurring workflow waits for the next paid period;
that next period gets its own required visits and one report.

## 6. Client tracking and reports

### `GET /api/v1/client/verification-requests/:id/tracking` — change

Client auth. Keep existing tracking data and add tier, payment, monitoring, paid-period and
site-check progress. The client response must not include internal agent/lawyer identifiers.

**Response — relevant fields**

```json
{
  "verificationRequestId": "request_123",
  "status": "SUBMITTED",
  "verificationTier": {
    "code": "STANDARD",
    "name": "Standard"
  },
  "monitoring": {
    "status": "ACTIVE",
    "plan": "MONTHLY",
    "currentPeriod": {
      "startsAt": "2026-11-04T12:20:00.000Z",
      "endsAt": "2026-12-04T12:20:00.000Z",
      "checksIncluded": 2,
      "checksCompleted": 1,
      "reportStatus": "PENDING",
      "siteVisits": [
        {
          "id": "visit_123",
          "visitNumber": 1,
          "status": "COMPLETED",
          "completedAt": "2026-11-04T13:40:00.000Z"
        },
        {
          "id": "visit_124",
          "visitNumber": 2,
          "status": "PENDING",
          "completedAt": null
        }
      ]
    },
    "cancelAtPeriodEnd": false
  },
  "updates": [
    {
      "status": "IN_PROGRESS",
      "message": "Bonafide has started the verification.",
      "createdAt": "2026-11-04T13:20:00.000Z"
    }
  ]
}
```

### Existing client report routes — change

Keep the paths and access checks. Add the package/tier, period and tier-specific result data.
Use Bonafide attribution and omit agent/lawyer names, IDs, assignments, and internal notes.

- `GET /api/v1/client/verification-requests/:id/report-summary`
- `GET /api/v1/client/verification-requests/:id/report/full`
- `GET /api/v1/client/verification-requests/:id/reports`

**Example report data** (inside the existing report response shape)

```json
{
  "verificationTier": {
    "code": "PREMIUM",
    "name": "Premium"
  },
  "subscriptionPeriod": {
    "startsAt": "2026-11-04T12:20:00.000Z",
    "endsAt": "2026-12-04T12:20:00.000Z",
    "checksIncluded": 2,
    "checksCompleted": 2
  },
  "providerName": "Bonafide",
  "findings": {
    "physicalVisits": [
      {
        "visitNumber": 1,
        "outcome": "VERIFIED",
        "notes": "The property was located and inspected."
      },
      {
        "visitNumber": 2,
        "outcome": "VERIFIED",
        "notes": "The property's access road and surroundings were inspected."
      }
    ],
    "landRegistry": {
      "outcome": "CLEAR",
      "reference": "LR-2026-123"
    },
    "valuation": {
      "amount": "85000000.00",
      "currency": "NGN",
      "basis": "Comparable local sales"
    },
    "feasibility": {
      "outcome": "SUITABLE_WITH_CONDITIONS",
      "assumptions": ["Planning permission is obtained"],
      "constraints": ["Access road upgrade may be required"]
    }
  },
  "reportDocument": {
    "url": "https://files.example/report.pdf",
    "contentType": "application/pdf"
  }
}
```

The example shows the maximum Premium shape; Basic and Standard should return only applicable
sections. For a one-visit period, older report responses may expose `physicalVisit`; support that
shape as well as `physicalVisits`. Existing historical reports without the new fields must remain
readable. `siteVisits` in tracking is the period's operational status; `physicalVisits` in a
report is the submitted evidence and findings.

## 7. Backend-only events and unchanged routes

The frontend does not call `POST /api/v1/webhook/stripe` or
`POST /api/v1/webhook/paystack`. The handlers must internally map provider events to the
versioned provider price, create each transaction/paid period/site-check set once, update
subscription status, and notify clients/admins. The frontend polls or refreshes the request,
tracking, and report endpoints after checkout.

These existing routes remain in the client flow and are not replaced by this contract:

- `GET /api/v1/client/services/verification/verification-types`
- `GET /api/v1/client/verification-types/:slug/plans` (legacy compatibility)
- `POST /api/v1/client/verification-requests/:id/documents`
- `GET /api/v1/client/verification-requests`
- `GET /api/v1/client/verification-requests/reports-summary`
- Existing request list pagination and notification preference routes.

## Contract and product decisions to confirm

- Approve package prices, Premium quote range/expiry, monitoring prices and included check
  counts before enabling checkout.
- Confirm which currencies/providers are actually enabled and the precise NGN rounding rule.
- Decide whether the checkout preview is a dedicated endpoint or fields on request detail.
- Confirm whether cancellation is immediate at provider level or always at the paid-period
  boundary; the client-facing promise is that the current paid period remains active.
- Confirm file limits, supported evidence types, and whether visit results are editable after
  an agent submits a report.
