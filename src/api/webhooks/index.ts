import express from "express";
import { paystackWebhook, callback_url } from "./paystack";
import { stripeWebhook } from "./stripe";

const webHookRouter = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     WebhookPaystackEvent:
 *       type: object
 *       description: >
 *         Paystack event envelope. Handled events - charge.success (marks the transaction with
 *         data.reference SUCCESS and the request paid; an unknown reference is treated as a subscription
 *         renewal and a new transaction is created), charge.failed and charge.abandoned (marks the
 *         transaction FAILED and the request payment-failed), subscription.create (stores the
 *         subscription against the user's latest paid request on the plan), invoice.payment_failed,
 *         subscription.not_renew and subscription.disable (set the stored subscription to PAYMENT_FAILED,
 *         NON_RENEWING or DISABLED), subscription.expiring_cards (looked up only, no side effects) and
 *         invoice.create (logged only). Any other event is acknowledged with 200 and ignored.
 *       required: [event, data]
 *       properties:
 *         event:
 *           type: string
 *           example: charge.success
 *           enum: [charge.success, charge.failed, charge.abandoned, subscription.create, invoice.payment_failed, subscription.not_renew, subscription.disable, subscription.expiring_cards, invoice.create]
 *         data:
 *           $ref: '#/components/schemas/WebhookPaystackEventData'
 *     WebhookPaystackEventData:
 *       type: object
 *       additionalProperties: true
 *       description: >
 *         Event payload. Only the fields below are read; all others are stored but ignored.
 *         The duplicate-detection key is "<event>:<reference | invoice_code | id | subscription_code>".
 *       properties:
 *         id:
 *           oneOf:
 *             - type: integer
 *             - type: string
 *           description: Paystack object ID; used for duplicate detection when there is no reference or invoice_code.
 *           example: 4099260516
 *         reference:
 *           type: string
 *           description: charge.* events - the transaction reference matched against Transaction.providerRef.
 *           example: ref_7PGx9kQ2
 *         amount:
 *           type: integer
 *           description: charge.* events - amount in the smallest currency unit; used only when a renewal transaction is created.
 *           example: 2500000
 *         currency:
 *           type: string
 *           description: charge.* events - used only when a renewal transaction is created (defaults to NGN).
 *           example: NGN
 *         paid_at:
 *           type: string
 *           format: date-time
 *           description: charge.* events - used to choose between several subscriptions of one customer on one plan.
 *           example: "2026-10-01T09:30:00.000Z"
 *         subscription_code:
 *           type: string
 *           description: subscription.* and invoice.payment_failed events (charge.* events may carry it in data.subscription.subscription_code).
 *           example: SUB_vsyqdmlzble3uii
 *         subscription:
 *           type: object
 *           description: Alternative location of subscription_code.
 *           properties:
 *             subscription_code:
 *               type: string
 *               example: SUB_vsyqdmlzble3uii
 *         invoice_code:
 *           type: string
 *           description: invoice.* events; used for duplicate detection.
 *           example: INV_8vbx1k4l2m
 *         email_token:
 *           type: string
 *           description: subscription.create - stored on the subscription.
 *           example: d7gofp6yppn3qz7
 *         next_payment_date:
 *           type: string
 *           format: date-time
 *           description: subscription.create and the subscription status events - stored as the next payment date.
 *           example: "2026-11-01T00:00:00.000Z"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: subscription.create - stored as the subscription start date (defaults to now).
 *           example: "2026-10-01T09:30:00.000Z"
 *         customer:
 *           type: object
 *           properties:
 *             customer_code:
 *               type: string
 *               description: Matched against User.paystackCustomerCode (subscription.create, subscription.expiring_cards, renewal charges).
 *               example: CUS_xnxdt6s1zg1f4nx
 *             email:
 *               type: string
 *               example: jane@example.com
 *         plan:
 *           type: object
 *           properties:
 *             plan_code:
 *               type: string
 *               description: Matched against VerificationPlan.paystackPlanCode (subscription.create, renewal charges).
 *               example: PLN_gx2wn530m0i3w3m
 *     WebhookStripeEvent:
 *       type: object
 *       description: >
 *         Stripe event envelope (verified with stripe.webhooks.constructEvent). Handled events -
 *         checkout.session.completed (data.object is a Checkout Session; metadata userId,
 *         verificationRequestId, transactionId and description must all be present, otherwise the event
 *         is ignored; marks the transaction SUCCESS with providerRef = session id and, when
 *         session.subscription is set, retrieves and stores the subscription),
 *         customer.subscription.updated (data.object is a Subscription; upserts it when its metadata is
 *         complete, else updates the stored subscription's status and period from items.data[0]),
 *         customer.subscription.deleted (data.object.id; marks the stored subscription INACTIVE),
 *         invoice.payment_failed (data.object.subscription; marks the request payment-failed) and
 *         invoice.paid (data.object is an Invoice; records a renewal transaction with providerRef = invoice
 *         id, amount_paid, currency and status_transitions.paid_at, skipping the first invoice when
 *         billing_reason is subscription_create and the initial payment is already recorded). Any other
 *         event is acknowledged with 200 and ignored.
 *       required: [id, type, data]
 *       properties:
 *         id:
 *           type: string
 *           description: Event ID; used for duplicate detection.
 *           example: evt_1Q2w3E4r5T6y7U8i
 *         object:
 *           type: string
 *           example: event
 *         type:
 *           type: string
 *           example: checkout.session.completed
 *           enum: [checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed, invoice.paid]
 *         created:
 *           type: integer
 *           description: Unix timestamp (seconds).
 *           example: 1759311000
 *         data:
 *           type: object
 *           required: [object]
 *           properties:
 *             object:
 *               type: object
 *               additionalProperties: true
 *               description: >
 *                 Checkout Session, Subscription or Invoice depending on type. Fields read - id, metadata
 *                 (userId, verificationRequestId, transactionId, description), subscription, status,
 *                 items.data[0].price.id, items.data[0].current_period_start, items.data[0].current_period_end,
 *                 billing_reason, amount_paid, currency, status_transitions.paid_at, created.
 *               example:
 *                 id: cs_test_a1b2c3
 *                 object: checkout.session
 *                 subscription: sub_1Q2w3E4r5T6y
 *                 metadata:
 *                   userId: cm1user0001
 *                   verificationRequestId: cm1verificationrequest01
 *                   transactionId: cm1transaction0001
 *                   description: Residential property verification
 *     WebhookReceived:
 *       type: object
 *       required: [received]
 *       properties:
 *         received:
 *           type: boolean
 *           example: true
 *     WebhookCallbackError:
 *       type: object
 *       required: [error]
 *       properties:
 *         error:
 *           type: string
 *           example: Transaction not found
 */

/**
 * @swagger
 * /api/{version}/webhook/paystack:
 *   post:
 *     tags: [Webhooks]
 *     summary: Paystack webhook
 *     description: >
 *       Receives Paystack events. Public, but the x-paystack-signature header must match. Each event is
 *       recorded in WebhookEvent; an event already marked processed returns 200 with {"received": true}
 *       and is not reprocessed. Unhandled event types are acknowledged with 200 and ignored. When handling
 *       fails (for example subscription.create arriving before the first charge.success) the endpoint
 *       returns 500 so Paystack retries.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: header
 *         name: x-paystack-signature
 *         required: true
 *         description: Hex HMAC-SHA512 of the JSON request body (as re-serialised by JSON.stringify) keyed with PAYSTACK_SECRET_KEY.
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebhookPaystackEvent'
 *           example:
 *             event: charge.success
 *             data:
 *               id: 4099260516
 *               reference: ref_7PGx9kQ2
 *               amount: 2500000
 *               currency: NGN
 *               paid_at: "2026-10-01T09:30:00.000Z"
 *               customer:
 *                 customer_code: CUS_xnxdt6s1zg1f4nx
 *                 email: jane@example.com
 *               plan:
 *                 plan_code: PLN_gx2wn530m0i3w3m
 *     responses:
 *       200:
 *         description: >
 *           Event handled (or ignored as unsupported) - plain-text "OK". An already-processed duplicate
 *           event instead returns JSON {"received": true}.
 *         content:
 *           text/plain:
 *             schema: { type: string, example: OK }
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookReceived'
 *       400:
 *         description: The x-paystack-signature header is missing or does not match. Plain-text body.
 *         content:
 *           text/plain:
 *             schema: { type: string, example: Bad Request }
 *       500:
 *         description: Handling the event failed; the event stays unprocessed and Paystack retries. Plain-text body.
 *         content:
 *           text/plain:
 *             schema: { type: string, example: Internal Server Error }
 */
webHookRouter.post("/paystack", paystackWebhook);

/**
 * @swagger
 * /api/{version}/webhook/paystack/callback:
 *   get:
 *     tags: [Webhooks]
 *     summary: Paystack payment callback
 *     description: >
 *       Redirect target after Paystack checkout. Reports the current status of the transaction with this
 *       reference; it does not change anything (the webhook updates the request).
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: query
 *         name: reference
 *         required: true
 *         description: Paystack transaction reference (Transaction.providerRef).
 *         schema: { type: string, example: ref_7PGx9kQ2 }
 *     responses:
 *       200:
 *         description: The transaction was found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message, reference, status]
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Payment received. Webhook processing will update the verification request.
 *                 reference:
 *                   type: string
 *                   example: ref_7PGx9kQ2
 *                 status:
 *                   type: string
 *                   description: The transaction's current PaymentStatus.
 *                   enum: [PENDING, SUCCESS, FAILED]
 *                   example: PENDING
 *       400:
 *         description: The reference query parameter is missing or empty. Note the body uses an "error" key, not ErrorResponse.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookCallbackError'
 *             example: { error: Reference not provided }
 *       404:
 *         description: No transaction has this reference. Note the body uses an "error" key, not ErrorResponse.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookCallbackError'
 *             example: { error: Transaction not found }
 */
webHookRouter.get("/paystack/callback", callback_url);

/**
 * @swagger
 * /api/{version}/webhook/stripe:
 *   post:
 *     tags: [Webhooks]
 *     summary: Stripe webhook
 *     description: >
 *       Receives Stripe events. Public, but the stripe-signature header is verified against the raw request
 *       body with STRIPE_WEBHOOK_SECRET. Each event is recorded in WebhookEvent by event id; an event
 *       already marked processed returns 200 {"received": true} without reprocessing. Unhandled event types
 *       are acknowledged with 200 and ignored. When handling fails the endpoint returns 500 so Stripe retries.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: header
 *         name: stripe-signature
 *         required: true
 *         description: Stripe signature header (t=...,v1=...), verified against the raw body with STRIPE_WEBHOOK_SECRET.
 *         schema: { type: string, example: "t=1759311000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebhookStripeEvent'
 *     responses:
 *       200:
 *         description: Event handled, ignored as unsupported, or already processed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookReceived'
 *       400:
 *         description: >
 *           STRIPE_WEBHOOK_SECRET is not configured, the stripe-signature header or raw body is missing, or the
 *           signature does not verify. Plain-text body.
 *         content:
 *           text/plain:
 *             schema: { type: string, example: Bad Request }
 *       500:
 *         description: Handling the event failed; the event stays unprocessed and Stripe retries. Plain-text body.
 *         content:
 *           text/plain:
 *             schema: { type: string, example: Internal Server Error }
 */
webHookRouter.post("/stripe", stripeWebhook);

export default webHookRouter;
