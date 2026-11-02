# Verification Flow — Pages and Endpoints

All endpoints below are under `/api/v1/client` and require `Authorization: Bearer <token>` unless marked public.

## 1. Determine the payment region

- `GET /profile` — read `countryCode`.
- If `countryCode` is `null`, ask the user to select a country and save its two-letter ISO code with `PATCH /profile`, for example `{"countryCode":"NG"}`.
- The supported mapping is Nigeria (`NG`) -> NGN / Paystack; every other country -> USD / Stripe. The backend enforces this mapping during checkout.

## 2. Choose a verification type and plan

- `GET /services/verification/verification-types` *(public)* — display the available types.
- `GET /verification-types/:slug/plans` *(public)* — load the selected type's plans. Each plan contains both `priceNgnKobo` and `priceUsdCents`, plus `paymentProviders`.
- Display `priceNgnKobo / 100` as NGN for `NG`; otherwise display `priceUsdCents / 100` as USD. These are separately configured prices, not a live currency conversion.

## 3. Create and configure the request

- `POST /verification-requests` — create a `DRAFT` request with `verificationTypeId` and the selected type's required `details`.
- `POST /verification-requests/:id/documents` — optionally upload supporting documents.
- `PATCH /verification-requests/:id/plan` — select the plan with `{"verificationPlanId":"<plan id>"}`.
- `GET /verification-requests/:id` — retrieve the request and selected plan for the payment summary.

## 4. Start checkout

Call the provider endpoint based on the saved profile country. Both require authentication, take no request body, and accept an `Idempotency-Key` header.

- `POST /verification-requests/:id/payment/initialize-paystack` — Nigeria only. The response includes `authorization_url`, `access_code`, and `reference`; redirect to `authorization_url`.
- `POST /verification-requests/:id/payment/initialize-stripe` — non-Nigerian countries only. The response includes `url`; redirect to it.

The backend determines the amount and currency from the selected plan. Do not send a price from the frontend.

## 5. Confirm the result

- The payment provider sends its event to the backend webhook (`/api/v1/webhook/paystack` or `/api/v1/webhook/stripe`). The frontend must not call these endpoints.
- After checkout returns, call `GET /verification-requests/:id` again and render from its `status`. A successful first payment moves the request to `SUBMITTED`; a failed payment moves it to `PAYMENT_FAILED`. Treat the checkout redirect as a return signal, not proof of payment; refresh or poll while the webhook is pending.

For the request list and ongoing updates, use `GET /verification-requests` and `GET /verification-requests/:id/tracking`.
