# Verification Pricing and Subscriptions: Task List

This is the execution checklist for the implementation plan. Work through tasks in dependency
order, record verification evidence, and mark a task complete only after its implementation and
focused validation are finished. Do not treat proposed prices as approved launch prices.

Related design documents:

- [Implementation plan](./verification-pricing-subscriptions-implementation.md)
- [Frontend API contract](./verification-pricing-subscriptions-frontend-api.md)

## Status key

- `NOT STARTED`: prerequisites are complete, but work has not started.
- `IN PROGRESS`: implementation is actively underway.
- `BLOCKED`: a prerequisite or product decision is outstanding.
- `DONE`: implementation is complete and its validation evidence is recorded.

## Execution checklist

Use this as a short readable sprint list. Each task includes the dependency and the proof that it is finished.

1. [DONE] Confirm pricing and billing policy
   - Depends on: Management approval
   - Evidence: Basic $25, Standard $60, Premium quote range $100-$200 with 14-day expiry; weekly $35, monthly $60, quarterly $200; admin-managed USD/NGN FX rounded to nearest kobo; explicit recurring consent; cancellation stops future renewals while preserving paid access; NG uses Paystack/NGN and supported non-NG countries use Stripe/USD; initial Paystack charge includes the package and first monitoring period, then renewals switch to monitoring-only.

2. [DONE] Add pricing and monitoring database schema
   - Depends on: 1
   - Evidence: Additive schema/migration for tiers, monitoring, FX settings, provider-price versions, quotes, transaction snapshots, subscription history/periods, visits, and structured report data; Prisma validation, client generation, and TypeScript checks passed; migration was applied to an isolated PostgreSQL 16 database with representative legacy records and preserved the old request-plan relationship while backfilling provider subscriptions and the three existing provider IDs.

3. [DONE] Implement pricing database functions
   - Depends on: 2
   - Evidence: Typed catalog/rate/provider-price queries; scoped tier and consent updates; quote request/read/issue/accept operations; immutable transaction snapshots; monitoring subscription, period, visit, and report writes; four focused unit tests; Jest, ESLint, TypeScript, and diff checks passed.

4. [DONE] Implement payment-provider price synchronization
   - Depends on: 3
   - Evidence: Stripe product/immutable Price and Paystack recurring Plan reconciliation with stable version markers, idempotency, and amount/currency/interval/product validation; new versions activate only after every required provider entry is ready; failures record errors and do not replace the previous active version; one-time Paystack amounts stay local and do not create plans; focused adapter/orchestration tests plus lint/type/diff checks passed.

5. [DONE] Update pricing and subscription seed/setup scripts
   - Depends on: 1, 4
   - Evidence: Seeds intentionally preserve any active admin-managed FX rate and ignore environment overrides when a live rate already exists; provider setup now refuses to overwrite active provider-price versions that do not match the local catalog, surfacing mismatches instead of silently reusing stale values.

6. [DONE] Build catalogue and admin pricing APIs
   - Depends on: 1, 3, 4
   - Evidence: Client and admin pricing catalog handlers now return active tiers, monitoring plans, and FX settings with NGN conversions; admin pricing updates validate USD amounts and FX rate changes, preserve active settings safely, and require admin authorization before persisting edits.

7. [DONE] Update request selection APIs
   - Depends on: 3
   - Evidence: Request pricing updates now save the selected verification tier, optional monitoring plan, and recurring consent; Basic-tier validation rejects monitoring selections; active request pricing cannot be changed once a quote or paid state exists; the legacy plan route remains available for compatibility.

8. [DONE] Update payment initialization and checkout snapshots
   - Depends on: 3, 4, 7
   - Evidence: Both provider initializers resolve active provider pricing and accepted Premium quotes server-side, persist provider/purpose/tier/FX/provider-price snapshots, and charge the initial package plus first monitoring period. Stripe supports mixed one-time/recurring line items and returns the Checkout Session ID; Paystack attaches the selected monitoring plan to the combined initial charge. Checkout summary uses locked Premium NGN pricing and reports payment readiness. Five focused suites (34 tests), TypeScript, and ESLint passed.

9. [DONE] Implement Premium quote lifecycle
   - Depends on: 6, 8
   - Evidence: Premium quote requests, admin issuance, and client acceptance are now wired through the pricing service and request routes; issuance validates the rate/version and acceptance records the locked quote before payment is authorized.

10. [DONE] Implement tier-specific agent reports
    - Depends on: 3
    - Evidence: Tier-aware agent forms validate and persist Basic, Standard, or Premium results and uploads, including tier/period snapshots. From the report screen, agents can mark each required visit complete through an assignment-scoped API; each completion increments the period count once, which gates report submission. The site-visit API integration test and focused service/handler tests pass; the tiered report integration test passed against the configured Aiven database after extending the report transaction timeout to 15 seconds. Event-queue logs reported missing `REDIS_URL`, but report persistence and assertions passed.
11. [DONE] Update client-facing report APIs
    - Depends on: 10
    - Evidence: Full report, report summary, and report history expose tier, subscription-period, section results, evidence, and Bonafide attribution while omitting agent identities/assignments and internal notes; backward-compatible legacy findings remain available. Client tracking also exposes the latest monitoring period, required/completed site-visit counts, visit status/completion time, report status, and renewal-cancellation state without agent identifiers; tracking unit tests pass.

12. [DONE] Update payment and subscription webhooks
    - Depends on: 3, 8
    - Evidence: Stripe and Paystack initial charges, renewals, failures, and status changes use immutable transaction terms and idempotent paid periods/visit sets; webhook retries preserve paid state and Paystack maps historical provider prices. Subscription reports are rejected until configured visits are complete, and agent completion updates the count idempotently. Focused webhook/report-gate/site-visit tests, TypeScript, and ESLint passed.

13. [DONE] Wire quote and payment-link email notifications
    - Depends on: 9
    - Evidence: Quote issuance queues a client review link; acceptance reuses the provider checkout initializer, queues the hosted payment link, and returns `QUEUED` only after enqueue succeeds. Added template keys, `CLIENT_APP_URL` link configuration, worker handlers, and focused route/worker tests; queue/provider errors return explicit API failures.

14. [DONE] Test provider synchronization
    - Depends on: 4, 5
    - Evidence: Provider orchestration and Stripe/Paystack adapter tests cover immutable provider objects, marker-based reuse/idempotent reruns, amount/currency/interval mismatch rejection, old provider-price mapping, and failed sync without activation.

15. [DONE] Test pricing and lifecycle end to end
    - Depends on: 5-13
    - Evidence: The earlier 20 focused suites (155 tests) cover pricing/rounding, request consent, initial and renewal amounts, quote locking and notifications, report access/site-visit gating, provider sync, and webhook retries. Four focused follow-up test files passed, including multiple-visit completion/idempotency and a live-database route integration test; TypeScript, focused ESLint, Prettier, and diff checks passed. The pricing migration and tier-report integration test were applied and verified in the prior checklist work; no other remote-database integration tests were run.

## Provider update rules

1. USD is the canonical catalogue currency. The backend calculates NGN values from the active versioned FX rate and the approved rounding rule.
2. Never edit an existing Stripe Price or Paystack Plan to change an amount. Create a new provider object for each changed sellable amount or interval and store its provider ID in a new local version.
3. Use a stable idempotency key and version marker. After creation, validate the provider response to confirm the amount, currency, and recurrence match the local version.
4. Persist the provider response and sync status. Activate the new version only after all required provider objects are confirmed. On failure, return an explicit error and keep the previous active version available for checkout.
5. Keep old provider IDs mapped indefinitely while existing subscriptions, transactions, or webhook events may still reference them. Never silently repoint an existing subscription.
6. For one-time charges, create a Stripe one-time Price or a server-calculated one-time Checkout line item. Paystack one-time checkout uses the computed NGN amount and does not require a recurring plan.
7. For recurring charges, create a new Paystack Plan when the NGN renewal amount or interval changes, and a new Stripe recurring Price when the USD renewal amount or interval changes. Existing subscribers keep their current provider terms unless an explicit migration is approved.
8. Keep the initial combined charge separate from the recurring renewal amount. Stripe Checkout can represent both together, but Paystack must explicitly collect the package plus first monitoring period once and then renew at the monitoring-only amount.
9. Seeds must not overwrite admin-managed USD prices or accepted quotes. Provider setup scripts must reconcile the active local version and surface provider mismatches instead of silently reusing stale amounts.

## Progress log

- 2026-11-05 — Task sheet
  - Result: Added the execution checklist and provider synchronization rules.

- 2026-11-05 — 5. Update pricing and subscription seed/setup scripts
  - Result: Seed logic now preserves active admin-managed pricing and logs when env overrides are ignored; provider setup validates active provider-state before syncing and aborts on mismatches instead of silently overwriting managed state.

- 2026-11-05 — 6. Build catalogue and admin pricing APIs
  - Result: Added admin pricing catalog read/update handlers and routes, plus the client catalog route, so the pricing catalogue and active FX settings are accessible with admin-only editing controls.

- 2026-11-05 — 7. Update request selection APIs
  - Result: Added the new request pricing mutation for tier + monitoring selection and preserved the Legacy /plan route so older clients still work while the new pricing model is adopted.

- 2026-11-05 — 1. Confirm pricing and billing policy
  - Result: Approved by user: proposed USD catalog, Premium quote range/14-day expiry, admin-managed FX rounded to nearest kobo, country/provider routing, recurring consent/cancellation behavior, and combined Paystack initial charge followed by monitoring-only renewals.

- 2026-11-05 — 2. Add pricing and monitoring database schema
  - Result: Added the schema and additive migration. Prisma validation, client generation, and TypeScript checks passed. Applied to an isolated PostgreSQL 16 database with legacy test records; verified the old request-plan relationship, both subscription records, and the Stripe/Paystack provider ID mappings survive. Legacy requests are intentionally not reassigned to a new tier or monitoring plan because the old plan model cannot identify them accurately.

- 2026-11-05 — 3. Implement pricing database functions
  - Result: Added typed shared data-access functions and updated request database contracts. Four focused Jest tests passed; ESLint and `tsc --noEmit` passed.

- 2026-11-05 — 4. Implement payment-provider price synchronization
  - Result: Added Stripe and Paystack synchronization adapters plus orchestration and atomic activation. Added tests for recurring/one-time behavior, quarterly interval mapping, idempotent reconciliation, provider term mismatches, and failed sync preserving the previous active version. Four focused Jest suites (19 tests), ESLint, `tsc --noEmit`, and `git diff --check` passed.

- Planned next — 5. Update pricing and subscription seed/setup scripts
  - Result: Pending. This item is next in the dependency order and will reconcile seed data with the approved catalog while preserving admin-managed prices.

- Planned next — 6. Build catalogue and admin pricing APIs
  - Result: Pending. This item follows the pricing model and provider sync work and covers the client/admin catalog and rate editing endpoints.

- Planned next — 7. Update request selection APIs
  - Result: Pending. This item covers tier selection, monitoring selection, consent, country validation, and legacy compatibility.

- Planned next — 8. Update payment initialization and checkout snapshots
  - Result: Pending. This item covers the server-calculated initial charge, country/provider routing, and immutable checkout snapshot data.

- Planned next — 9. Implement Premium quote lifecycle
  - Result: Pending. This item covers request/read, issue, accept, expiry, and locked checkout behavior for Premium quotes.

- Planned next — 10. Implement tier-specific agent reports
  - Result: In progress. Added tier-aware checklist sections and required fields, server-side result/upload validation, persistent report findings and snapshots, and agent report views; focused unit tests and TypeScript checks pass. The integration test could not run because the configured database is missing the pricing migration.

- Planned next — 11. Update client-facing report APIs
  - Result: Pending. This item covers customer-visible report payloads, media, attribution, and hidden internal identities.

- Planned next — 12. Update payment and subscription webhooks
  - Result: Pending. This item covers transaction and renewal processing, checks, and idempotent event handling.

- Planned next — 13. Wire quote and payment-link email notifications
  - Result: Pending. This item covers quote issuance, checkout links, and notification delivery/failure handling.

- Planned next — 14. Test provider synchronization
  - Result: Pending. This item covers provider-version immutability, reruns, validation rules, historical mapping, and failed-sync behavior.

- Planned next — 15. Test pricing and lifecycle end to end
  - Result: Pending. This item covers end-to-end pricing, renewal, quote-locking, report access, mail, webhook retries, and TypeScript/build validation.

- 2026-11-05 — 10. Implement tier-specific agent reports (IN PROGRESS)
  - Result: Added tier-aware sections, structured field and upload validation, report findings with tier/period snapshots, and dynamic agent report views. Focused unit tests (35), ESLint, Prettier, and `tsc --noEmit` passed. Integration validation is blocked because the configured Aiven database predates the pricing migration.

- 2026-11-05 — Complete site-visit tracking and report-gate workflow
  - Result: Added assignment-scoped visit completion from the report workflow, visit details to the agent checklist, and period-level visit/report progress to client tracking. Integration assertions confirm each completed visit increments the paid-period counter exactly once.
  - Validation: Four focused Jest files, including the live-database route integration test, plus TypeScript, ESLint, Prettier, and diff checks passed.
