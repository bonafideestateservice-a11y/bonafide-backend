import { Request, Response } from "express";
import { logger } from "../../utils/logger";
import { prismaClient } from "../../utils/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Webhook
// ─────────────────────────────────────────────────────────────────────────────

export const stripeWebhook = async (req: Request, res: Response) => {
  // TODO: import { stripe } from "../../lib/stripe"; and Stripe types
  // const sig = req.headers["stripe-signature"] as string;
  // let event: Stripe.Event;
  //
  // try {
  //   event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  // } catch (err) {
  //   logger.error("Stripe webhook signature verification failed:", err);
  //   return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
  // }

  // ── Placeholder: parse event from body until Stripe SDK is wired ───────
  const event = req.body as { id: string; type: string; data: { object: any } };

  logger.info(`Received Stripe webhook: ${event.type}, ID: ${event.id}`);

  // ── Idempotency check ──────────────────────────────────────────────────
  const existingWebhook = await prismaClient.webhookEvent.findUnique({
    where: { eventId: event.id },
  });

  if (existingWebhook?.processed) {
    logger.info(`Stripe webhook already processed: ${event.id}`);
    return res.json({ received: true });
  }

  if (!existingWebhook) {
    await prismaClient.webhookEvent.create({
      data: {
        integration: "stripe",
        eventId: event.id,
        data: event as any,
        verified: true,
      },
    });
  }

  // ── payment_intent.succeeded ───────────────────────────────────────────
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    logger.info("Stripe payment_intent.succeeded", { id: paymentIntent.id });

    try {
      // TODO: look up transaction by paymentIntent.id or metadata
      // TODO: update transaction status to SUCCESS
      // TODO: update VerificationRequest status
      // TODO: emit events / send notifications
    } catch (error) {
      logger.error("Error handling payment_intent.succeeded", { error });
    }
  }

  // ── payment_intent.payment_failed ──────────────────────────────────────
  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object;
    logger.info("Stripe payment_intent.payment_failed", { id: paymentIntent.id });

    try {
      // TODO: look up transaction by paymentIntent.id
      // TODO: mark transaction as FAILED
      // TODO: revert VerificationRequest status if needed
    } catch (error) {
      logger.error("Error handling payment_intent.payment_failed", { error });
    }
  }

  // ── payment_intent.canceled ────────────────────────────────────────────
  if (event.type === "payment_intent.canceled") {
    const paymentIntent = event.data.object;
    logger.info("Stripe payment_intent.canceled", { id: paymentIntent.id });

    try {
      // TODO: look up transaction by paymentIntent.id
      // TODO: mark transaction as FAILED/CANCELLED
    } catch (error) {
      logger.error("Error handling payment_intent.canceled", { error });
    }
  }

  // ── checkout.session.completed (if using Checkout) ─────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    logger.info("Stripe checkout.session.completed", { id: session.id });

    try {
      // TODO: look up transaction by session metadata
      // TODO: update transaction + verification request status
    } catch (error) {
      logger.error("Error handling checkout.session.completed", { error });
    }
  }

  // ── Unhandled event ────────────────────────────────────────────────────
  // All events are acknowledged; only the ones above get business logic.

  // ── Mark as processed ──────────────────────────────────────────────────
  await prismaClient.webhookEvent.update({
    where: { eventId: event.id },
    data: { processed: true },
  });

  return res.json({ received: true });
};
