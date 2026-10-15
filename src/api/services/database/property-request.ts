import { randomInt } from "crypto";
import {
  PaymentProvider,
  Prisma,
  PropertyPaymentMethod,
  PropertyPaymentStatus,
  PropertyRequestStatus,
  PropertyRequestType,
} from "@prisma/client";
import { prismaClient } from "../../../utils/prisma";
import { logger } from "../../../utils/logger";

const OPEN_STATUSES: PropertyRequestStatus[] = [
  PropertyRequestStatus.SUBMITTED,
  PropertyRequestStatus.CONSULTATION,
  PropertyRequestStatus.IN_PROGRESS,
];

const REFERENCE_PREFIX: Record<PropertyRequestType, string> = {
  PURCHASE: "BF-PUR",
  CONSULTATION: "BF-CON",
};

const STATUS_LABELS: Record<PropertyRequestStatus, string> = {
  SUBMITTED: "Request submitted",
  CONSULTATION: "Consultation",
  IN_PROGRESS: "Purchase in progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** The progress steps each request type goes through (CANCELLED can end any of them). */
const STEPS: Record<PropertyRequestType, PropertyRequestStatus[]> = {
  PURCHASE: ["SUBMITTED", "CONSULTATION", "IN_PROGRESS", "COMPLETED"],
  CONSULTATION: ["SUBMITTED", "CONSULTATION", "COMPLETED"],
};

export const requestSelect = {
  id: true,
  reference: true,
  type: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, fullName: true, email: true, phone: true } },
  updates: {
    orderBy: { createdAt: "asc" },
    select: { status: true, note: true, createdAt: true },
  },
  payment: {
    select: {
      id: true,
      reference: true,
      amountInKobo: true,
      currency: true,
      status: true,
      provider: true,
      method: true,
      checkoutUrl: true,
      paidAt: true,
    },
  },
  property: {
    select: {
      id: true,
      name: true,
      propertyType: true,
      address: true,
      area: true,
      city: true,
      priceAmount: true,
      priceCurrency: true,
      bedrooms: true,
      bathrooms: true,
      amenities: true,
      coverImageUrl: true,
    },
  },
} satisfies Prisma.PropertyRequestSelect;

export type RequestRow = Prisma.PropertyRequestGetPayload<{ select: typeof requestSelect }>;
type PaymentRow = NonNullable<RequestRow["payment"]>;

export const toPaymentResponse = (payment: PaymentRow) => ({
  id: payment.id,
  reference: payment.reference,
  amount: Number(payment.amountInKobo) / 100,
  currency: payment.currency,
  status: payment.status,
  provider: payment.provider,
  method: payment.method,
  // Only useful while the checkout is open.
  checkoutUrl: payment.status === PropertyPaymentStatus.PROCESSING ? payment.checkoutUrl : null,
  paidAt: payment.paidAt?.toISOString() ?? null,
});

/** A request as both the client and admin APIs return it. */
export const toRequestResponse = (request: RequestRow) => {
  const steps = [...STEPS[request.type]];
  if (request.status === PropertyRequestStatus.CANCELLED) {
    steps.splice(steps.indexOf("COMPLETED"), 1, "CANCELLED");
  }
  const currentIndex = steps.indexOf(request.status);
  const reachedAt = (status: PropertyRequestStatus) =>
    request.updates.find((update) => update.status === status)?.createdAt.toISOString() ?? null;

  return {
    id: request.id,
    reference: request.reference,
    type: request.type,
    status: request.status,
    statusLabel: STATUS_LABELS[request.status],
    steps: steps.map((status, index) => ({
      status,
      label: STATUS_LABELS[status],
      done: index < currentIndex || request.status === PropertyRequestStatus.COMPLETED,
      current: index === currentIndex,
      reachedAt: index <= currentIndex ? reachedAt(status) : null,
    })),
    updates: request.updates.map((update) => ({
      status: update.status,
      note: update.note,
      createdAt: update.createdAt.toISOString(),
    })),
    payment: request.payment ? toPaymentResponse(request.payment) : null,
    property: {
      id: request.property.id,
      title: request.property.name,
      type: request.property.propertyType,
      address: request.property.address,
      location: { area: request.property.area, city: request.property.city },
      price: {
        amount: Number(request.property.priceAmount),
        currency: request.property.priceCurrency,
      },
      bedrooms: request.property.bedrooms,
      bathrooms: request.property.bathrooms,
      amenities: request.property.amenities,
      coverImageUrl: request.property.coverImageUrl,
    },
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
};

const sixDigits = () => String(randomInt(100000, 1000000));

/**
 * "Purchase Property" or "Request Consultation". Returns the client's open request of that
 * type for the property (created: false) instead of making a second one. Null when the
 * property isn't published.
 */
export const createPropertyRequest = async (
  userId: string,
  propertyId: string,
  type: PropertyRequestType,
) => {
  const property = await prismaClient.property.findFirst({
    where: { id: propertyId, isPublished: true, deletedAt: null },
    select: { id: true },
  });
  if (!property) return null;

  const open = await prismaClient.propertyRequest.findFirst({
    where: { userId, propertyId, type, status: { in: OPEN_STATUSES } },
    select: requestSelect,
  });
  if (open) return { request: open, created: false };

  // The 6-digit number is random, so retry the rare clash with an existing reference.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const request = await prismaClient.propertyRequest.create({
        data: {
          reference: `${REFERENCE_PREFIX[type]}-${sixDigits()}`,
          type,
          userId,
          propertyId,
          updates: { create: { status: PropertyRequestStatus.SUBMITTED } },
        },
        select: requestSelect,
      });
      logger.info(`Property request created reference=${request.reference}`);
      return { request, created: true };
    } catch (error) {
      const clash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!clash || attempt === 4) throw error;
    }
  }
};

export const findPropertyRequest = (where: Prisma.PropertyRequestWhereInput) =>
  prismaClient.propertyRequest.findFirst({ where, select: requestSelect });

/** A page of requests, newest first, in the client (default) or admin shape. */
export const listPropertyRequests = async <T>(
  where: Prisma.PropertyRequestWhereInput,
  page: number,
  limit: number,
  toResponse: (request: RequestRow) => T = toRequestResponse as (request: RequestRow) => T,
) => {
  const [totalItems, rows] = await Promise.all([
    prismaClient.propertyRequest.count({ where }),
    prismaClient.propertyRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: requestSelect,
    }),
  ]);
  return {
    data: rows.map(toResponse),
    meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
  };
};

export type StatusChangeResult =
  | { kind: "NOT_FOUND" }
  | { kind: "FINISHED"; status: PropertyRequestStatus }
  | { kind: "NOT_A_PURCHASE" }
  | { kind: "UPDATED"; request: RequestRow };

/**
 * An admin moves a request to a new status. A purchase reaching IN_PROGRESS gets its one
 * payment, for the property's listed price.
 */
export const setPropertyRequestStatus = async (
  id: string,
  status: PropertyRequestStatus,
  note: string | null,
): Promise<StatusChangeResult> => {
  const request = await prismaClient.propertyRequest.findUnique({
    where: { id },
    select: {
      type: true,
      status: true,
      reference: true,
      payment: { select: { id: true } },
      property: { select: { priceAmount: true, priceCurrency: true } },
    },
  });
  if (!request) return { kind: "NOT_FOUND" };
  if (!OPEN_STATUSES.includes(request.status)) return { kind: "FINISHED", status: request.status };
  if (
    status === PropertyRequestStatus.IN_PROGRESS &&
    request.type !== PropertyRequestType.PURCHASE
  ) {
    return { kind: "NOT_A_PURCHASE" };
  }

  const needsPayment = status === PropertyRequestStatus.IN_PROGRESS && !request.payment;
  const updated = await prismaClient.propertyRequest.update({
    where: { id },
    data: {
      status,
      updates: { create: { status, note } },
      ...(needsPayment
        ? {
            payment: {
              create: {
                reference: request.reference.replace(/^BF-PUR/, "BF-PAY"),
                amountInKobo: request.property.priceAmount * BigInt(100),
                currency: request.property.priceCurrency,
              },
            },
          }
        : {}),
    },
    select: requestSelect,
  });
  logger.info(`Property request ${updated.reference} moved to ${status}`);
  return { kind: "UPDATED", request: updated };
};

/** Records a new checkout attempt on the payment. */
export const startPropertyPaymentCheckout = (
  paymentId: string,
  attempt: {
    provider: PaymentProvider;
    method: PropertyPaymentMethod;
    providerRef: string;
    checkoutUrl: string;
  },
) =>
  prismaClient.propertyPayment.update({
    where: { id: paymentId },
    data: { ...attempt, status: PropertyPaymentStatus.PROCESSING },
  });

const naira = (kobo: bigint, currency: string) =>
  `${currency} ${(Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

/**
 * A provider confirmed the payment. The purchase stays IN_PROGRESS (paying doesn't complete
 * it); the result is added to the request's updates. Charges for a different amount or
 * currency are logged and ignored.
 */
export const markPropertyPaymentSuccessful = async (
  paymentId: string,
  charge: { provider: PaymentProvider; providerRef: string; amount: number; currency: string },
) => {
  const payment = await prismaClient.propertyPayment.findUnique({
    where: { id: paymentId },
    include: { request: { select: { status: true } } },
  });
  if (!payment) {
    logger.warn(`Property payment not found paymentId=${paymentId}`);
    return;
  }
  if (payment.status === PropertyPaymentStatus.SUCCESSFUL) {
    if (payment.providerRef !== charge.providerRef) {
      // A second checkout was also paid: needs a refund.
      logger.error(
        `Property payment ${payment.reference} was paid again providerRef=${charge.providerRef}; refund it`,
      );
    }
    return;
  }
  if (
    BigInt(charge.amount) !== payment.amountInKobo ||
    charge.currency.toUpperCase() !== payment.currency.toUpperCase()
  ) {
    logger.error(
      `Property payment ${payment.reference} charge doesn't match: ${charge.currency} ${charge.amount} vs ${payment.currency} ${payment.amountInKobo}`,
    );
    return;
  }

  await prismaClient.propertyPayment.update({
    where: { id: paymentId },
    data: {
      status: PropertyPaymentStatus.SUCCESSFUL,
      provider: charge.provider,
      providerRef: charge.providerRef,
      paidAt: new Date(),
      request: {
        update: {
          updates: {
            create: {
              status: payment.request.status,
              note: `Payment of ${naira(payment.amountInKobo, payment.currency)} received`,
            },
          },
        },
      },
    },
  });
  logger.info(`Property payment ${payment.reference} successful`);
};

/** A checkout attempt failed. Ignored once the payment has succeeded. */
export const markPropertyPaymentFailed = async (paymentId: string, providerRef: string) => {
  const payment = await prismaClient.propertyPayment.findUnique({
    where: { id: paymentId },
    include: { request: { select: { status: true } } },
  });
  if (!payment || payment.status === PropertyPaymentStatus.SUCCESSFUL) return;
  // An older attempt failing doesn't fail a newer one still open.
  if (payment.providerRef && payment.providerRef !== providerRef) return;

  await prismaClient.propertyPayment.update({
    where: { id: paymentId },
    data: {
      status: PropertyPaymentStatus.FAILED,
      request: {
        update: {
          updates: {
            create: { status: payment.request.status, note: "Payment was not successful" },
          },
        },
      },
    },
  });
  logger.info(`Property payment ${payment.reference} failed`);
};

export type PayablePayment =
  | { kind: "NOT_FOUND" }
  | { kind: "NO_PAYMENT" }
  | { kind: "CLOSED"; status: PropertyRequestStatus }
  | { kind: "PAID" }
  | {
      kind: "PAYABLE";
      payment: Prisma.PropertyPaymentGetPayload<object>;
      email: string;
      propertyName: string;
    };

/** The client's purchase payment, if it can be paid now. */
export const getPayablePayment = async (
  requestId: string,
  userId: string,
): Promise<PayablePayment> => {
  const request = await prismaClient.propertyRequest.findFirst({
    where: { id: requestId, userId },
    select: {
      status: true,
      payment: true,
      user: { select: { email: true } },
      property: { select: { name: true } },
    },
  });
  if (!request) return { kind: "NOT_FOUND" };
  if (!OPEN_STATUSES.includes(request.status)) return { kind: "CLOSED", status: request.status };
  if (!request.payment) return { kind: "NO_PAYMENT" };
  if (request.payment.status === PropertyPaymentStatus.SUCCESSFUL) return { kind: "PAID" };
  return {
    kind: "PAYABLE",
    payment: request.payment,
    email: request.user.email,
    propertyName: request.property.name,
  };
};

/** A request with its client, for the admin API. */
export const toAdminRequestResponse = (request: RequestRow) => ({
  ...toRequestResponse(request),
  client: {
    id: request.user.id,
    name: request.user.fullName,
    email: request.user.email,
    phone: request.user.phone,
  },
});
