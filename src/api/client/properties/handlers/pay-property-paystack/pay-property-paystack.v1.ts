import { PaymentProvider, PropertyPaymentMethod, PropertyPaymentStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { createPaystackCheckout } from "../../../../../libs/paystack/paystack";
import { logger } from "../../../../../utils/logger";
import {
  getPayablePayment,
  startPropertyPaymentCheckout,
  toPaymentResponse,
} from "../../../../services/database/property-request";
import { paymentError, userIdOf } from "../shared";

const CHANNEL = { CARD: "card", BANK_TRANSFER: "bank_transfer" } as const;

/** "Confirm payment" (and "Retry payment") with Paystack: card or bank transfer. */
export const payPropertyPaystackHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const method = req.body?.method as PropertyPaymentMethod;
  if (!Object.values(PropertyPaymentMethod).includes(method)) {
    return next(new BadRequestError("method must be CARD or BANK_TRANSFER."));
  }
  try {
    const result = await getPayablePayment(req.params.id, userIdOf(req));
    const error = paymentError(result);
    if (error || result.kind !== "PAYABLE") return next(error);
    const { payment } = result;

    // The same checkout is still open: return it rather than starting a second one.
    if (
      payment.status === PropertyPaymentStatus.PROCESSING &&
      payment.provider === PaymentProvider.PAYSTACK &&
      payment.method === method &&
      payment.checkoutUrl
    ) {
      res.status(HttpStatusCode.OK).json(toPaymentResponse(payment));
      return;
    }

    const session = await createPaystackCheckout({
      email: result.email,
      amount: Number(payment.amountInKobo),
      currency: payment.currency,
      channels: [CHANNEL[method]],
      metadata: { kind: "property_payment", propertyPaymentId: payment.id },
    });
    const started = await startPropertyPaymentCheckout(payment.id, {
      provider: PaymentProvider.PAYSTACK,
      method,
      providerRef: session.reference,
      checkoutUrl: session.authorization_url,
    });
    res.status(HttpStatusCode.OK).json(toPaymentResponse(started));
  } catch (error) {
    logger.error(`Error starting Paystack property payment: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Unable to start the payment."));
  }
};
