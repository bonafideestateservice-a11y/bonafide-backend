# Verification Packages and Monitoring Subscriptions: Implementation Plan

Status: **Proposed; prices and subscription terms require Bonafide management approval before
launch.** Use provider test accounts and test keys during development. Do not copy production
credentials into this document or development configuration.

## Purpose and proposed catalogue

The customer first selects one verification package, then may select weekly, monthly, or quarterly
monitoring—or choose no monitoring. These are separate line items in the initial checkout:
verification is one-time, while monitoring is recurring. Successful payment starts the existing
recurring-payment lifecycle immediately. Monitoring is available only for Standard and Premium;
Basic is not eligible.

### One-time verification packages

- **Basic — $25 fixed:** One site visit, brief local enquiries, photos or video where needed, and
  one short report. The price includes service and transport allowance.
- **Standard — $60 fixed:** Everything in Basic, plus a land registry check, court-records search,
  local intelligence gathering, and one detailed report.
- **Premium — $100–$200; request a quote:** Everything in Standard, plus a property valuation and
  feasibility report for the property's intended use. Bonafide confirms the exact amount before
  payment.

### Optional recurring monitoring

Monitoring is an optional add-on selected immediately after the customer picks a verification
package. The customer may choose one monitoring schedule or choose none. The checkout total is
the verification price plus the first monitoring period's price. If the customer chooses none,
checkout charges only for the verification and the request gets one verification report.

For Standard or Premium with monitoring selected, the checkout records the package and recurring
monitoring purchases. Successful payment immediately activates the provider subscription according
to Stripe or Paystack's normal recurring schedule. The initial transaction represents the
verification package and the first paid monitoring period. Provider renewals create later paid
periods and do not bypass the normal paid-transaction/report lifecycle. There is no additional
admin authority or activation step before provider recurring billing begins.

- **Weekly — $35 per week:** One site check and one report each week.
- **Monthly — $60 per month:** Two site checks and one report each month.
- **Quarterly — $200 every three months:** Three site checks and one report every three months.

One check means one location in an agreed service area. Extra work requires a separately approved
quote. USD is the canonical catalogue currency. The package catalogue returns both the USD price
and its NGN equivalent, calculated server-side from the current Bonafide-configured USD-to-NGN
rate and rounding rule. The frontend reads the client's saved country and chooses which returned
price to display: Nigeria (`NG`) displays NGN; other supported countries display USD. This display
decision belongs to the frontend. The backend separately enforces the supported country/provider
combination during payment initialization: NG uses Paystack, while other supported countries use
Stripe. If the client has not set a country, require them to select one before checkout.
At checkout, show the selected currency's package price, monitoring price, total, and (for NGN)
the rate used. The server calculates and snapshots the charge; the frontend must not convert
prices or supply the charge amount. Show this note when applicable:

For USD customers, show: "Prices are displayed in US dollars."

For NGN customers, show: "Naira prices are converted from USD using the current exchange rate.
Your final NGN total is shown before payment."

Customer-facing descriptions, reports, and updates must identify **Bonafide** as responsible for
the checks, reports, and customer updates. Agent and lawyer identities/assignments remain internal;
do not expose them in client-facing package, report, or notification responses.

## Existing implementation and gap

The current payment flow is:

1. `GET /api/v1/client/services/verification/verification-types` lists service types such as
   property verification.
2. `GET /api/v1/client/verification-types/:slug/plans` returns that type's `VerificationPlan`
   rows, each with a frequency (`ONE_TIME`, `MONTHLY`, or `QUARTERLY`) and separately stored USD
   and NGN prices. Preserve this legacy contract during migration; the new package catalogue
   uses USD as its canonical price and returns a server-calculated NGN equivalent.
3. `POST /api/v1/client/verification-requests` creates a `DRAFT` request with type and property
   details. `PATCH /api/v1/client/verification-requests/:id/plan` chooses one `verificationPlanId`.
4. The client calls either
   `POST /api/v1/client/verification-requests/:id/payment/initialize-stripe` or
   `POST /api/v1/client/verification-requests/:id/payment/initialize-paystack`. The server reads
   the selected plan and its price; the client cannot set the amount. Stripe currently uses USD
   and Paystack uses NGN, selected/enforced using the client's country.
5. A `Transaction` is reserved, the provider checkout is initialized, and its URL/reference is
   stored. Stripe uses a one-time Checkout session for `ONE_TIME` and a subscription Checkout
   session otherwise. Paystack passes the stored NGN plan code for recurring plans.
6. Provider webhooks mark the transaction successful and move the request to `SUBMITTED`. A
   recurring charge creates another transaction. The existing recurring lifecycle treats each
   paid transaction as one reportable period.
7. An admin assigns an agent. The existing agent workflow uses a fixed five-section checklist
   (physical, court/crime, title deeds/documentation, valuation, amenities/environment), supports
   checklist media, and requires a PDF report upload.

Relevant existing records/routes: `VerificationPlan`, `VerificationRequest`, `Transaction`,
`PaystackSubscription`, `StripeSubscription`, `VerificationChecklistItem`, `Document`, and
`VerificationReport` in `prisma/schema.prisma`; payment endpoints and plan lookup in
`src/api/client/verification`; provider setup in `scripts/setup-paystack-plans.ts` and
`scripts/setup-stripe-products.ts`; webhook handlers in `src/api/webhooks`.

The current model cannot represent the requested offer cleanly:

- A verification type is the service category, not Basic/Standard/Premium. A plan combines the
  service category with a billing frequency, so a client cannot select a one-time tier and then
  independently add monitoring.
- There is no weekly frequency, no exchange-rate setting, no Premium quote acceptance, and no
  package-price administration API.
- There is no explicit client cancellation endpoint; existing provider cancellation handling
  must be preserved and exposed through the compatible API.
- A monthly/quarterly payment currently implies one agent assignment/report. That does not meet
  the two checks/one report monthly or three checks/one report quarterly counts.
- Provider setup scripts create plans/prices when missing, but do not synchronize edited amounts.
  Replacing a provider plan/price pointer without retaining its history would also break mapping
  of existing Paystack subscription events.
- Current seed/test values (for example, $45 for a one-time plan and $35 for existing recurring
  plans) are not the proposed package catalogue. Do not treat them as launch prices or let seeding
  overwrite admin-managed prices.

## Checkout and recurring-payment rule

The customer selects a verification package, then optionally selects one monitoring schedule in
the same purchase flow. When monitoring is selected, the initial checkout total is:

`verification package (or accepted Premium quote) + first monitoring period`

The initial transaction must preserve those amounts as separate line items in its immutable
pricing snapshot, even if the provider receives one combined checkout charge. With no monitoring
selected, the transaction contains only the verification price and the request produces one
verification report.

Store the monitoring plan and the customer's recurring consent with the request before checkout.
Successful payment starts the provider's subscription immediately; there is no prepaid-period
waiting step and no separate `authority confirmed` or admin activation gate. Stripe subscription
checkout and Paystack plan checkout retain their provider-specific first-charge and renewal
behavior. The implementation must prevent duplicate charging during subscription creation and
must verify provider-specific first-charge behavior in the test environment.

For each successful recurring payment:

1. Record an immutable `Transaction` linked to the verification request.
2. Move the request to `SUBMITTED` so it is ready for admin assignment.
3. Send a successful-payment email and in-app notification to the client and every active admin.
4. Send admins a renewal-specific notification stating that monitoring payment was received and
   that the paid period requires scheduling/assignment.
5. Let the admin assign an agent. For the current system, report submission removes the current
   assignment and sets the request to `AWAITING_RENEWAL`; the next paid renewal moves it back to
   `SUBMITTED`, allowing the admin to assign an agent again.

## Database changes

Use an additive migration and backfill existing plans/requests. Preserve historical transactions,
reports, subscriptions, provider IDs, and current API behavior during rollout.

### Package and price catalogue

1. Add `VerificationTier` rows for Basic, Standard, Premium, associated with the existing
   verification service/type scope where needed. Suggested fields: stable code, display name,
   included-scope description, canonical fixed USD cents or quote-required flag, optional
   minimum/maximum USD cents for Premium, `active`, and timestamps. Do not set a fabricated fixed
   Premium checkout amount.
2. Add `MonitoringPlan` rows for WEEKLY, MONTHLY, and QUARTERLY. Store canonical USD cents,
   checks per period (`1`, `2`, `3`), reports per period (`1` each), billing interval, active
   state, and timestamps. Store counts as data; do not infer them from the interval.
3. Add a singleton `PricingSettings` (or equivalent versioned settings row) for the USD-to-NGN
   rate in NGN per USD, effective time/version, configured rounding rule, updater, and timestamps.
   Use decimal/scaled-integer arithmetic, not floating-point math. With USD cents and NGN kobo,
   `NGN kobo = USD cents * rate`, rounded according to the explicitly configured NGN rounding
   rule. The public catalogue returns both USD and calculated NGN values; only USD catalogue
   amounts are directly edited. Checkout recalculates the applicable NGN amount from the active
   rate and records that rate/version with the transaction.
4. Add immutable/versioned provider-price records for each sellable package and currency/provider:
   local catalogue/version ID, USD amount, currency amount, provider name, Stripe Price ID or
   Paystack plan code, active-for-new-checkout state, sync status/error, and timestamps. Keep old
   provider IDs mapped for existing subscriptions and webhook processing.
5. Keep Premium quotes as records rather than overwriting the catalogue range: request, quoted USD
   amount, its NGN equivalent, the exchange-rate value/version and rounding rule used to derive
   that equivalent, package/price version, expiry, status, admin who issued it, and client
   acceptance time. The admin supplies the USD quote; the server calculates and stores both
   currency amounts when the quote is issued. A quote must be accepted before payment
   initialization; acceptance locks both amounts. A later FX-rate change must not alter an
   issued quote. After issuance, email the client the quote summary and a frontend link to review
   and accept it. After acceptance, create the provider-hosted payment checkout using the saved
   country (Stripe/USD outside NG, Paystack/NGN for NG) and email that checkout link to the
   client. Only the frontend decides which already-returned quote amount to display; the backend
   determines and validates the provider/currency used to charge it.

### Request, payment, and subscription lifecycle

1. Add a tier relation to `VerificationRequest`; keep the existing service/type relation. Store the
   selected monitoring plan and the customer's consent with the request before checkout. Successful
   payment activates the existing provider subscription immediately.
2. Add or adapt the monitoring subscription record with request, plan, provider-price version,
   status, client consent time, start/end/cancellation times, and provider IDs. Support history
   rather than assuming one lifetime subscription per request.
3. Add `SubscriptionPeriod` records to track period start/end, paid transaction, included/completed
   site checks, and report count. Add `SiteVisit` records (visit number, status, scheduled/completed
   times, optional location/checklist media) so two or three checks can belong to one paid period.
   Keep the existing one-report-per-paid-period behavior, but create one report only after the
   period's required checks are complete.
4. Extend `Transaction` with immutable package/price-version IDs and a pricing snapshot: tier amount,
   first monitoring-period amount when selected, combined total, exchange rate/version,
   charged amount/currency, provider, provider price/plan ID, and transaction purpose (initial
   purchase or renewal). Preserve `amountInCents` as the provider-currency minor-unit amount or
   rename it only through a compatibility migration. Never recompute historical receipts from
   today's catalogue.
5. Link a `VerificationReport` to its package/tier and `SubscriptionPeriod` where applicable. Keep
   package/scope snapshots so editing the current catalogue cannot change old reports.
6. Extend checklist/form data with tier-specific structured results. `VerificationChecklistItem`
   can gain a typed section key and structured result JSON (or use normalized result fields if the
   UI needs strict reporting/querying). Continue using `Document` for uploads and existing
   checklist/report media relationships.

### Agent report form by tier

Retain the common physical/site visit section for every tier. Build the checklist sections from the
selected tier rather than showing all five fixed sections for every package:

- **Basic:** visit outcome, brief local-enquiry notes, property/site photos or video, and short
  report. Keep the existing PDF report upload.
- **Standard:** all Basic fields plus land-registry search outcome/reference and supporting
  document/image upload; court-records search outcome/reference and supporting upload; local
  intelligence narrative and supporting photos/documents; detailed report upload.
- **Premium:** all Standard fields plus valuation amount/currency, basis/comparable evidence and
  valuation document upload; intended-use feasibility outcome, assumptions/constraints and
  supporting document/image; final detailed report upload.

Make appropriate fields required only for the selected tier, validate them on the server, and
persist them in structured checklist results and uploads linked to the report so agent assignment
deletion does not lose the evidence. The assignment checklist API returns each section key, its
field definitions, saved result, and media; report submission rejects incomplete tier-required
fields or uploads. Snapshot the selected tier and paid subscription period with the submitted
findings. Keep agent/legal review details internal. The client report should present the work as a
Bonafide report, not expose internal personnel as the responsible party.

## Endpoints to add and change

Paths below omit the common `/api/v1` prefix. Register handlers in the owning client/admin router,
add Swagger schemas, authorize admin operations with existing JWT/role middleware, and use the
existing database-service/provider-library boundaries.

| Method and path | Change | Purpose |
|---|---|---|
| `GET /client/verification-packages` | **Add** (or replace/extend `GET /client/verification-types/:slug/plans`) | Return active tiers and monitoring plans with canonical USD amounts and server-calculated NGN equivalents, package inclusions, Premium quote range in both currencies, monitoring counts, enabled provider/currency options, and current NGN rate/version. The frontend reads country from profile and chooses displayed price (NG displays NGN; otherwise USD). No provider secrets or inactive price IDs. |
| `GET /client/profile` | **Existing; use in frontend flow** | Frontend reads the client's `countryCode` to choose which returned currency to display. If unset, require country selection with existing `PATCH /client/profile` before checkout. Backend separately validates provider/currency on payment. |
| `GET /client/verification-requests/:id/checkout-summary` | **Add (recommended)** | Return both currency totals and line items, current exchange-rate/version, and the country-selected provider/charge before redirect. If no separate endpoint is added, include the same fields in request detail. Never take amount/currency from the client. |
| `POST /client/verification-requests` | **Change** | Accept existing type/property details plus `verificationTierId`; allow an optional `monitoringPlanId` and explicit recurring consent. Validate tier/plan compatibility (Basic cannot have monitoring) and store the selections on the draft. |
| `PATCH /client/verification-requests/:id/plan` | **Change/deprecate compatibly** | Select or change the tier and optional monitoring plan before payment instead of the current single frequency-based `verificationPlanId`. Reject changes once payment is successful; return a migration-compatible response while old clients are supported. |
| `POST /client/verification-requests/:id/quote` | **Add** if Premium quote is requested through the client | Create/submit a Premium quote request for the site/intended use. |
| `GET /client/verification-requests/:id/quote` | **Add** | Return the current quote and status to the request owner. |
| `POST /admin/verification-requests/:id/quote` | **Add** | Admin issues a Premium quote by entering its USD amount; the server calculates and stores the NGN equivalent plus the issuance rate/version and rounding rule. Return both amounts and email the client a link to review/accept the quote. |
| `POST /client/verification-requests/:id/quote/accept` | **Add/change** | Record client acceptance of the exact quote, initialize provider-hosted checkout based on saved country (USD/Stripe outside NG; NGN/Paystack for NG), and email the hosted payment link to the client. Return the checkout URL and status. Reuse payment initialization/idempotency logic; do not accept client-supplied amounts/provider. |
| `POST /client/verification-requests/:id/payment/initialize-stripe` | **Change** | Calculate the server-side total from the selected tier/accepted Premium quote plus the first monitoring period, if selected. Store both line items and the total in a transaction snapshot; never accept client-supplied amounts. Use Stripe payment mode for a one-time package and subscription mode for recurring monitoring, preserving the provider's existing behavior. |
| `POST /client/verification-requests/:id/payment/initialize-paystack` | **Change** | Same server-side total and snapshot rules, deriving NGN from the configured rate and showing the total before redirect. Paystack plan checkout starts its recurring subscription immediately according to the stored plan, with idempotent transaction handling. |
| `PATCH /admin/pricing/tiers/:id` | **Add** | Update canonical USD package prices and sellability. NGN display prices are derived from the active rate. Require admin authorization, validation, audit metadata, and provider synchronization status. Premium updates change its USD quote range/defaults, not an already accepted quote. |
| `PATCH /admin/pricing/monitoring-plans/:id` | **Add** | Update canonical USD subscription price, interval, and included counts. Return its recalculated NGN equivalent. Do not permit a price or FX change to silently alter active customers' existing terms. |
| `GET /admin/pricing` | **Add** | Read canonical USD catalogue amounts, calculated NGN equivalents, exchange-rate version, and provider sync health. |
| `PATCH /admin/pricing/exchange-rate` | **Add** | Update the USD-to-NGN rate, requiring a positive validated value and audit record; return the new rate/effective time. USD prices are unchanged. |
| `POST /client/verification-requests/:id/subscription/cancel` | **Add** | Record explicit cancellation and cancel through the provider at the period boundary or provider-supported equivalent. The already-paid period remains active; no next renewal is charged. |
| Existing `POST /admin/verification-requests/:id/assign-agent` | **Change** | Assign only after a confirmed payment; a monitoring assignment covers its paid period and all included `SiteVisit` records. |
| `POST /admin/verification/agent-assignments/:id/site-visits/:visitId/complete` | **Add** | Let the assigned agent mark each visit complete from the report workflow. Completion is idempotent and increments the assignment's paid-period count exactly once per visit. |
| Existing `POST /admin/verification/agent-assignments/:id/report` and checklist endpoints | **Change** | Render/validate the package-specific form and uploads; save tier-specific report results and period/visit linkage. |
| Existing client report summary/full/history endpoints | **Change** | Return the applicable tier and report findings while keeping internal agent/lawyer details private and attributing delivery to Bonafide. |
| Existing Paystack/Stripe webhook endpoints | **Change internally; URLs remain** | Resolve provider events using immutable provider-price mappings, record each paid period once, preserve consented subscriptions, and track renewal/cancellation/payment failures idempotently. |

Existing routes to preserve during migration include `GET /client/verification-types/:slug/plans`,
the two payment initializer paths, and current report routes. Introduce the new contract with an
API version or compatibility adapter rather than silently changing the meaning of
`verificationPlanId` for existing clients.

## Stripe and Paystack catalogue synchronization

Provider catalogue changes must be driven by the canonical Bonafide catalogue and a versioned
sync service, not by manually editing provider dashboards as the source of truth.

### Stripe

- Stripe Price amounts are immutable. For a changed amount, create a new Price for the product,
  persist the returned Price ID as a new provider-price version, and make it active for future
  checkouts only after the local record is committed.
- Keep the previous Price ID/version for active subscriptions and webhook lookup. Do not assume
  changing the current price pointer changes the amount for existing customers.
- Use `lookup_key` values with explicit versioning or transfer the lookup key when switching. The
  current `ensureStripePrice` returns an existing lookup-key price without checking whether its
  amount matches; change this before using it for editable prices.
- Existing subscriptions remain at their agreed amount unless management chooses a migration and
  obtains any required customer consent. If approved, migrate them through Stripe's subscription
  update flow and record the result/audit trail.

### Paystack

- Create a new Paystack plan code for each changed recurring amount/interval and record it as a new
  provider-price version. Do not treat the current `paystackNgnPlanCode` alone as sufficient
  history.
- Maintain a mapping from every active/legacy Paystack plan code to its local monitoring plan and
  price version. Update webhook matching (`subscription.create` and renewal charge lookup) to use
  this mapping; otherwise old subscriptions stop matching when the active code changes.
- Keep old plans available for existing subscriptions. Apply new codes to new checkouts only.
  Existing subscribers stay on their original amount unless an explicitly approved and consented
  migration is implemented.

### One-time package payments

- Stripe needs a new one-time Price (or a server-created one-time line item) when its USD amount
  changes.
- Paystack one-time checkout receives the server-calculated NGN amount at transaction
  initialization; it does not need a recurring Paystack plan. It still needs a local price version
  and transaction snapshot.

### Safe admin update flow

1. Validate the proposed package/rate change and require an admin audit record.
2. Create new provider prices/plans idempotently in the configured **test or live** environment.
   Use a stable idempotency key and a marker containing the local package/version ID, provider,
   currency, and interval.
3. Save provider responses as inactive/new versions. If any provider sync fails, keep the current
   active version and expose the failure to the admin; do not report the price update as successful.
4. Atomically activate the new local price version after all required providers are ready (or mark
   a provider unavailable and omit it from checkout only after an explicit admin choice).
5. Checkout reads the active provider-price version and stores a snapshot on `Transaction`.
6. Re-running synchronization must reconcile existing versions and report mismatched amounts; it
   must not silently reuse a stale Stripe Price or Paystack plan code.

The exchange-rate endpoint updates the local NGN conversion setting, not the USD catalogue. The
package endpoint returns both the canonical USD amount and NGN equivalent derived from its
current rate. New Paystack checkouts use the current rate for catalogue and monitoring line
items and snapshot it; existing transactions and subscriptions retain their saved charged
amount. Premium quotes are issued with both USD and NGN amounts and an issuance rate/version.
Acceptance locks both quote amounts; a later rate update does not reprice that quote. The
country-selected quote amount is charged as stored, while any separately priced monitoring line
uses the active checkout rate. Record both rate snapshots in the transaction when they differ.
Provider recurring plans must be re-created when their NGN recurring amount changes because of
either a monitoring USD price change or an exchange-rate change—not when an unrelated package
price changes.

## Payment and monitoring lifecycle

1. Client selects Basic, Standard, or Premium and selects optional weekly/monthly/quarterly
   monitoring or "No monitoring." Basic only permits "No monitoring." Selecting monitoring
   requires explicit recurring consent. For Premium, the request remains `QUOTE_REQUIRED` until
   an admin issues a quote. Email the client a link to review and accept it. The client sees
   both quote amounts; the frontend chooses which to display based on profile country. After
   acceptance, initialize the provider-hosted checkout based on saved country (Stripe/USD
   outside NG; Paystack/NGN for NG) and email that payment link to the client. The frontend
   handles display only; provider routing and charge validation remain server-side.
2. Read country from the client profile. Display NGN for `NG`, otherwise USD; prompt for a
   country if missing. The package catalogue supplies both USD and NGN prices. Display the
   country-selected checkout total before payment: tier/accepted Premium quote price alone, or
   tier plus the first monitoring period. For NGN show the configured rate and final rounded
   naira total. Save both USD line-item prices, charged currency/amount, and applicable rate
   versions.
3. Payment initialization reserves a transaction idempotently and calculates all amounts on the
   server. The payment webhook confirms the full initial total. No monitoring selection means one
   paid verification and one report.
4. For a paid monitoring selection, mark the initial monitoring period paid and create the active
   provider subscription immediately. Do not add a prepaid waiting state or an
   `authority confirmed` requirement before recurring billing begins.
5. Record provider subscription creation and status through existing Stripe/Paystack webhook
   handlers. Verify duplicate/out-of-order events cannot create duplicate subscriptions,
   transactions, periods, or reports.
6. Create exactly the plan's configured number of site-check tasks for each paid period. Create
   one monitoring report per period only after its required checks are complete. Renewals create
   the next period's checks, not another report for the previous period.
7. Renew only with consent. A successful renewal creates a new transaction and moves the request
   to `SUBMITTED`; it sends the client a payment receipt and sends active admins a payment and
   assignment-needed notification. The admin assigns work for the paid period. A failed renewal
   records a failed transaction and follows the existing retry/payment-failure behavior.
8. Cancellation stops the next renewal, not access to the already-paid period. Unused site checks
   expire at period end unless Bonafide caused the delay; retain the exception and resolution in
   the period audit record.
9. Send status/report/renewal communications as Bonafide. Preserve current webhook idempotency and
   ensure duplicate provider events cannot create duplicate transactions, checks, periods, or
   reports.

## Rollout and test checklist

1. Approve prices, Premium quote limits, provider availability, currency rounding, immediate
   recurring billing behavior, existing-customer treatment, cancellation behavior, and delayed-visit
   exception rules.
2. Add schema/migration and backfill existing `ONE_TIME` plans to tiers and recurring plans to
   monitoring plans. Keep IDs/provider mappings needed for existing requests/subscriptions. Test
   migration on a database copy before deployment.
3. Add admin catalogue/rate and quote workflows; add provider-price versioning/sync; test against
   Stripe and Paystack test environments only.
4. Implement package selection/payment snapshots, webhook/subscription lifecycle, visit-period
   tracking, tier-specific agent forms, report output, and client-facing Bonafide attribution.
5. Test at minimum:
   - Basic $25 total and short report; monitoring is unavailable.
   - Standard $60 and all required Standard evidence fields/uploads.
   - Standard/Premium with no monitoring charges only the tier price and produces one verification
     report.
   - Standard/Premium with monitoring charges the tier and first monitoring period as configured,
     the selection and consent are saved, and the provider subscription starts immediately without
     an additional admin activation step or duplicate charge.
   - Premium quote request, admin USD quote issuance with both USD/NGN amounts and saved FX
     version, client acceptance, and exact country-selected quoted payment; no payment before
     acceptance and no repricing after a rate update.
   - Weekly: one visit and one report; monthly: two checks and one report; quarterly: three checks
     and one report.
   - Catalogues return both USD and NGN values; country selection displays USD/Stripe outside NG
     and NGN/Paystack for NG.
   - Stripe USD and Paystack NGN totals, rate display/rounding, recalculated catalogue NGN values,
     and unchanged canonical USD price after a rate update.
   - Admin price update creates new provider price/plan versions; failed synchronization leaves
     the previous active checkout price intact.
   - Existing provider subscriptions continue to map to their historical plan/price after an
     update; no implicit repricing.
   - Monitoring is not selectable for Basic; missing consent blocks checkout; cancellation prevents
     the next renewal only while the already-paid period remains valid.
   - Successful renewals create one transaction, move the request to `SUBMITTED`, email the client
     and active admins, and leave the paid period ready for admin assignment.
   - Duplicate, failed, out-of-order, and renewal webhooks; one transaction/period/check set/report
     per successful payment.
   - Client report endpoints do not expose internal agent/lawyer identity and identify Bonafide as
     responsible.
6. Deploy with test keys/webhooks first. Enable production checkout only after management approval,
   provider synchronization verification, and end-to-end sign-off.
