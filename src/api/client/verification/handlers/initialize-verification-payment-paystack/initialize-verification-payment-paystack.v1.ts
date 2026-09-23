import {
  PaymentMethod,
  PaymentStatus,
  Prisma,
  VERIFICATION_FREQUENCY,
  VerificationStatus,
} from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import {
  createPaystackCustomer,
  createPaystackSession,
} from "../../../../../libs/paystack/paystack";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export const initializeVerificationPaymentPaystack = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  let transactionId: string | undefined;

  try {
    const customReq = req as CustomRequest;
    const userId = customReq.user?.id ?? customReq.token?.id;
    const verificationRequestId = req.params.id?.trim();

    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }
    if (!verificationRequestId) {
      return next(new BadRequestError("Verification request id is required."));
    }

    const verificationRequest = await prismaClient.verificationRequest.findUnique({
      where: { id: verificationRequestId },
      include: { user: true, verificationPlan: true },
    });

    if (!verificationRequest) {
      return next(new NotFoundError("Verification request not found."));
    }
    if (verificationRequest.userId !== userId) {
      return next(new ForbiddenError("You cannot pay for this request."));
    }
    const payableStatuses: VerificationStatus[] = [
      VerificationStatus.DRAFT,
      VerificationStatus.PENDING_PAYMENT,
      VerificationStatus.PAYMENT_FAILED,
    ];
    if (!payableStatuses.includes(verificationRequest.status)) {
      return next(new ConflictError("This verification request is not available for payment."));
    }
    if (!verificationRequest.verificationPlan) {
      return next(new BadRequestError("Select a verification plan before payment."));
    }
    const verificationPlan = verificationRequest.verificationPlan;

    const planCode = verificationPlan.paystackPlanCode;
    if (verificationPlan.frequency !== VERIFICATION_FREQUENCY.ONE_TIME && !planCode) {
      return next(new BadRequestError("The selected plan is not configured in Paystack."));
    }

    let transaction;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        transaction = await prismaClient.$transaction(
          async (tx) => {
            const existingTransaction = await tx.transaction.findFirst({
              where: { verificationRequestId },
              orderBy: { createdAt: "desc" },
            });

            if (existingTransaction?.status === PaymentStatus.SUCCESS) {
              throw new ConflictError("This verification request has already been paid for.");
            }
            if (existingTransaction?.status === PaymentStatus.PENDING) {
              if (
                existingTransaction.providerRef &&
                existingTransaction.authorizationUrl &&
                existingTransaction.accessCode
              ) {
                return existingTransaction;
              }
              throw new ConflictError("A payment is already being initialized for this request.");
            }

            if (existingTransaction) {
              return tx.transaction.update({
                where: { id: existingTransaction.id },
                data: {
                  status: PaymentStatus.PENDING,
                  providerRef: null,
                  authorizationUrl: null,
                  accessCode: null,
                  paidAt: null,
                },
              });
            }

            return tx.transaction.create({
              data: {
                verificationRequestId,
                amountInCents: verificationPlan.priceInCents,
                currency: verificationPlan.currency,
                method: PaymentMethod.CARD,
                status: PaymentStatus.PENDING,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2034" ||
          attempt === 2
        ) {
          throw error;
        }
      }
    }

    if (!transaction) {
      throw new Error("Unable to reserve payment transaction");
    }
    transactionId = transaction.id;

    if (transaction.providerRef && transaction.authorizationUrl && transaction.accessCode) {
      res.status(HttpStatusCode.OK).json({
        authorization_url: transaction.authorizationUrl,
        access_code: transaction.accessCode,
        reference: transaction.providerRef,
      });
      return;
    }

    let customerCode = verificationRequest.user.paystackCustomerCode;
    if (!customerCode) {
      const customer = await createPaystackCustomer(verificationRequest.user.email);
      customerCode = customer.customer_code;

      try {
        await prismaClient.user.update({
          where: { id: userId },
          data: { paystackCustomerCode: customerCode },
        });
      } catch (error) {
        logger.warn(`Paystack customer created but could not be saved userId=${userId}: ${error}`);
        throw error;
      }
    }

    if (!customerCode) {
      throw new Error("Paystack customer code was not returned");
    }

    const session = await createPaystackSession({
      userId,
      email: verificationRequest.user.email,
      customer: customerCode,
      plan: planCode || undefined,
      amount: verificationPlan.priceInCents,
      currency: verificationPlan.currency,
      paymentMethod: PaymentMethod.CARD,
      verificationRequestId,
      transactionId,
    });

    if (!session?.reference || !session.authorization_url || !session.access_code) {
      throw new Error("Paystack returned an invalid transaction session");
    }

    await prismaClient.$transaction([
      prismaClient.transaction.update({
        where: { id: transactionId },
        data: {
          providerRef: session.reference,
          authorizationUrl: session.authorization_url,
          accessCode: session.access_code,
        },
      }),
      prismaClient.verificationRequest.update({
        where: { id: verificationRequestId },
        data: { status: VerificationStatus.PENDING_PAYMENT },
      }),
    ]);

    res.status(HttpStatusCode.OK).json({
      authorization_url: session.authorization_url,
      access_code: session.access_code,
      reference: session.reference,
    });
  } catch (error) {
    if (transactionId) {
      await prismaClient.transaction.updateMany({
        where: { id: transactionId, status: PaymentStatus.PENDING, providerRef: null },
        data: { status: PaymentStatus.FAILED },
      });
    }
    logger.error(`Error initializing verification payment: ${error}`);
    next(
      error instanceof ApiError
        ? error
        : new ApiError(HttpStatusCode.INTERNAL_SERVER, "Unable to initialize payment."),
    );
  }
};

export default initializeVerificationPaymentPaystack;
