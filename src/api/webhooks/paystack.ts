import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../../utils/logger";
import { prismaClient } from "../../utils/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Paystack Webhook (server-to-server)
// ─────────────────────────────────────────────────────────────────────────────

export const paystackWebhook = async (
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const signature = req.headers["x-paystack-signature"] as string;
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  const hash = crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== signature) {
    logger.error("Paystack webhook signature verification failed");
    return res.sendStatus(400);
  }

  const event = req.body;
  const eventId = event.data?.reference ?? event.data?.id ?? `paystack-${Date.now()}`;

  logger.info(`Received Paystack webhook: ${event.event}, ID: ${eventId}`);

  // ── Idempotency check ──────────────────────────────────────────────────
  const existingWebhook = await prismaClient.webhookEvent.findUnique({
    where: { eventId },
  });

  if (existingWebhook?.processed) {
    logger.info(`Paystack webhook already processed: ${eventId}`);
    return res.json({ received: true });
  }

  if (!existingWebhook) {
    await prismaClient.webhookEvent.create({
      data: {
        integration: "paystack",
        eventId,
        data: event as any,
        verified: true,
      },
    });
  }

  // ── charge.success ─────────────────────────────────────────────────────
  if (event.event === "charge.success") {
    const reference = event.data.reference;
    logger.info("Paystack charge.success received", { reference });

    try {
      const transaction = await prismaClient.transaction.findFirst({
        where: { providerRef: reference },
      });

      if (!transaction) {
        logger.error("Transaction not found for Paystack reference", { reference });
        return res.sendStatus(404);
      }

      // TODO: idempotency — skip if already SUCCESS
      // TODO: update transaction status to SUCCESS
      // TODO: update VerificationRequest status (e.g. SUBMITTED)
      // TODO: emit events / send notifications
    } catch (error) {
      logger.error("Error handling charge.success webhook", { error, reference });
    }
  }

  // ── charge.failed / charge.abandoned ───────────────────────────────────
  if (event.event === "charge.failed" || event.event === "charge.abandoned") {
    const reference = event.data?.reference;
    logger.info(`Paystack ${event.event} received`, { reference });

    try {
      if (reference) {
        const transaction = await prismaClient.transaction.findFirst({
          where: { providerRef: reference },
        });

        if (transaction) {
          // TODO: mark transaction as FAILED
          // TODO: revert VerificationRequest status if needed
        }
      }
    } catch (error) {
      logger.error("Error handling failed/abandoned webhook", { error, reference });
    }
  }

  // ── Mark as processed ──────────────────────────────────────────────────
  await prismaClient.webhookEvent.update({
    where: { eventId },
    data: { processed: true },
  });

  return res.sendStatus(200);
};

// ─────────────────────────────────────────────────────────────────────────────
// Callback URL (browser redirect after Paystack checkout)
// ─────────────────────────────────────────────────────────────────────────────

export const callback_url = async (req: Request, res: Response) => {
  const reference = req.query.reference as string;

  logger.info("Paystack callback_url called", { reference });

  if (!reference) {
    logger.warn("Reference not provided in callback_url");
    return res.status(400).json({ error: "Reference not provided" });
  }

  try {
    const transaction = await prismaClient.transaction.findFirst({
      where: { providerRef: reference },
    });

    if (!transaction) {
      logger.error("Transaction not found for Paystack reference", { reference });
      return res.status(404).json({ error: "Transaction not found" });
    }

    // TODO: verify transaction with Paystack API
    // TODO: if success & not already PAID → run handleSuccessfulPayment
    // TODO: if failed/abandoned → mark FAILED
    // TODO: redirect user to appropriate page or return JSON

    return res.status(200).json({
      message: "Transaction verified",
      reference,
      status: transaction.status,
    });
  } catch (error) {
    logger.error("Error in callback_url", { error, reference });
    return res.status(500).json({ error: "Failed to verify transaction" });
  }
};
