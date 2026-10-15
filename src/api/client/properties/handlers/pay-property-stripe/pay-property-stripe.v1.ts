import { PaymentProvider, PropertyPaymentMethod, PropertyPaymentStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { createStripeCheckout, STRIPE_MAX_AMOUNT } from "../../../../../libs/stripe/stripe";
import { logger } from "../../../../../utils/logger";
import {
  getPayablePayment,
  startPropertyPaymentCheckout,
  toPaymentResponse,
} from "../../../../services/database/property-request";
import { paymentError, userIdOf } from "../shared";

/** "Confirm payment" (and "Retry payment") by card with Stripe. */
export const payPropertyStripeHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await getPayablePayment(req.params.id, userIdOf(req));
    const error = paymentError(result);
    if (error || result.kind !== "PAYABLE") return next(error);
    const { payment } = result;

    if (payment.amountInKobo > BigInt(STRIPE_MAX_AMOUNT)) {
      return next(
        new BadRequestError(
          "This amount is above Stripe's limit for a single payment. Pay with Paystack instead.",
        ),
      );
    }
    // The same checkout is still open: return it rather than starting a second one.
    if (
      payment.status === PropertyPaymentStatus.PROCESSING &&
      payment.provider === PaymentProvider.STRIPE &&
      payment.checkoutUrl
    ) {
      res.status(HttpStatusCode.OK).json(toPaymentResponse(payment));
      return;
    }

    const session = await createStripeCheckout({
      amount: Number(payment.amountInKobo),
      currency: payment.currency,
      name: `${result.propertyName} (${payment.reference})`,
      metadata: { kind: "property_payment", propertyPaymentId: payment.id },
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    const started = await startPropertyPaymentCheckout(payment.id, {
      provider: PaymentProvider.STRIPE,
      method: PropertyPaymentMethod.CARD,
      providerRef: session.id,
      checkoutUrl: session.url,
    });
    res.status(HttpStatusCode.OK).json(toPaymentResponse(started));
  } catch (error) {
    logger.error(`Error starting Stripe property payment: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Unable to start the payment."));
  }
};
