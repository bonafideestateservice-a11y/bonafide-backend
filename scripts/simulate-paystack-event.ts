import crypto from "crypto";
import dotenv from "dotenv";
import { paystackPriceOf } from "../src/libs/paystack/paystack";
import { prismaClient } from "../src/utils/prisma";
import { logger } from "../src/utils/logger";

dotenv.config({ path: "./.env" });

/**
 * TEST MODE ONLY. Sends a signed Paystack webhook for a recurring request's subscription, so
 * renewals can be tested without waiting a month. The target server must use the same
 * PAYSTACK_SECRET_KEY (test key) as .env.
 *
 *   npm run paystack:simulate -- <verificationRequestId> renewal|renewal-failed|cancel [webhookUrl]
 */
const DEFAULT_URL = "https://bonafide-backend-9mly.onrender.com/api/v1/webhook/paystack";
const kinds = ["renewal", "renewal-failed", "cancel"] as const;

async function main() {
  const [verificationRequestId, kind, url = DEFAULT_URL] = process.argv.slice(2);
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!secret.startsWith("sk_test_")) throw new Error("Only runs with a Paystack test key.");
  if (!verificationRequestId || !kinds.includes(kind as (typeof kinds)[number])) {
    throw new Error(`Usage: <verificationRequestId> ${kinds.join("|")} [webhookUrl]`);
  }

  const subscription = await prismaClient.paystackSubscription.findUnique({
    where: { verificationRequestId },
    include: { verificationPlan: true },
  });
  if (!subscription) {
    throw new Error("This request has no Paystack subscription (pay for a recurring plan first).");
  }

  const stamp = Date.now();
  const refs = {
    customer: { customer_code: subscription.customerCode },
    subscription: { subscription_code: subscription.subscriptionCode },
  };
  const price = paystackPriceOf(subscription.verificationPlan);
  const event =
    kind === "renewal"
      ? {
          event: "charge.success",
          data: {
            ...refs,
            reference: `sim_renewal_${stamp}`,
            status: "success",
            amount: price.amount,
            currency: price.currency,
            paid_at: new Date().toISOString(),
            plan: { plan_code: subscription.verificationPlan.paystackPlanCode },
          },
        }
      : kind === "renewal-failed"
        ? {
            event: "invoice.payment_failed",
            data: { ...refs, invoice_code: `sim_invoice_${stamp}` },
          }
        : {
            event: "subscription.disable",
            data: { ...refs.customer, subscription_code: subscription.subscriptionCode },
          };

  // Signed exactly as Paystack does: HMAC-SHA512 of the body with the secret key.
  const body = JSON.stringify(event);
  const signature = crypto.createHmac("sha512", secret).update(body).digest("hex");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
    body,
  });
  logger.info(`Sent ${event.event} for request ${verificationRequestId} -> ${response.status}`);
  if (!response.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    logger.error(`${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => prismaClient.$disconnect());
