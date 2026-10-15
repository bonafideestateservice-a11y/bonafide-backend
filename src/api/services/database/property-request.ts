import { randomInt } from "crypto";
import {
  PaymentProvider,
  Prisma,
  PropertyPaymentMethod,
  PropertyPaymentStatus,
  NotificationType,
  PropertyRequestStatus,
  PropertyRequestType,
  PropertyUpdateKind,
} from "@prisma/client";
import { prismaClient } from "../../../utils/prisma";
import { logger } from "../../../utils/logger";

const OPEN_STATUSES: PropertyRequestStatus[] = [
  PropertyRequestStatus.SUBMITTED,
  PropertyRequestStatus.CONSULTATION,
  PropertyRequestStatus.IN_PROGRESS,
  PropertyRequestStatus.OWNERSHIP_TRANSFER,
];

/** Statuses only a purchase can have. */
const PURCHASE_ONLY: PropertyRequestStatus[] = [
  PropertyRequestStatus.IN_PROGRESS,
  PropertyRequestStatus.OWNERSHIP_TRANSFER,
];

const REFERENCE_PREFIX: Record<PropertyRequestType, string> = {
  PURCHASE: "BF-PUR",
  CONSULTATION: "BF-CON",
};

const STATUS_LABELS: Record<PropertyRequestStatus, string> = {
  SUBMITTED: "Request submitted",
  CONSULTATION: "Consultation",
  IN_PROGRESS: "Purchase in progress",
  OWNERSHIP_TRANSFER: "Ownership transfer",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Ongoing stages are "Progress updates"; reaching a stage boundary is a "Milestone". */
const KIND_OF: Record<PropertyRequestStatus, PropertyUpdateKind> = {
  SUBMITTED: "MILESTONE",
  CONSULTATION: "MILESTONE",
  IN_PROGRESS: "PROGRESS",
  OWNERSHIP_TRANSFER: "PROGRESS",
  COMPLETED: "MILESTONE",
  CANCELLED: "MILESTONE",
};

/** The card text for a status change that has no note of its own. */
const defaultMessage = (
  status: PropertyRequestStatus,
  type: PropertyRequestType,
  property: string,
) => {
  const what = type === PropertyRequestType.PURCHASE ? "purchase" : "consultation";
  switch (status) {
    case "SUBMITTED":
      return `Your ${what} request for ${property} was received.`;
    case "CONSULTATION":
      return `Bonafide is assisting with your consultation about ${property}.`;
    case "IN_PROGRESS":
      return `Bonafide is facilitating your purchase of ${property}.`;
    case "OWNERSHIP_TRANSFER":
      return `Bonafide is handling the ownership transfer and legal documentation for ${property}.`;
    case "COMPLETED":
      return type === PropertyRequestType.PURCHASE
        ? `Your purchase of ${property} has been completed with Bonafide's assistance.`
        : `Your consultation about ${property} is complete.`;
    default:
      return `Your ${what} request for ${property} was cancelled.`;
  }
};

/** The progress steps each request type goes through (CANCELLED can end any of them). */
const STEPS: Record<PropertyRequestType, PropertyRequestStatus[]> = {
  PURCHASE: ["SUBMITTED", "CONSULTATION", "IN_PROGRESS", "OWNERSHIP_TRANSFER", "COMPLETED"],
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
    select: { status: true, kind: true, title: true, note: true, createdAt: true },
  },
  _count: { select: { documents: true } },
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
      kind: update.kind,
      title: update.title ?? STATUS_LABELS[update.status],
      message: update.note ?? defaultMessage(update.status, request.type, request.property.name),
      createdAt: update.createdAt.toISOString(),
    })),
    documentCount: request._count.documents,
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
          updates: {
            create: {
              status: PropertyRequestStatus.SUBMITTED,
              kind: KIND_OF.SUBMITTED,
              title: STATUS_LABELS.SUBMITTED,
            },
          },
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
 * payment, for the property's listed price. The client gets an in-app notification.
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
      userId: true,
      payment: { select: { id: true } },
      property: { select: { name: true, priceAmount: true, priceCurrency: true } },
    },
  });
  if (!request) return { kind: "NOT_FOUND" };
  if (!OPEN_STATUSES.includes(request.status)) return { kind: "FINISHED", status: request.status };
  if (PURCHASE_ONLY.includes(status) && request.type !== PropertyRequestType.PURCHASE) {
    return { kind: "NOT_A_PURCHASE" };
  }

  const needsPayment = status === PropertyRequestStatus.IN_PROGRESS && !request.payment;
  const updated = await prismaClient.propertyRequest.update({
    where: { id },
    data: {
      status,
      updates: { create: { status, note, kind: KIND_OF[status], title: STATUS_LABELS[status] } },
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

  // The client's Updates screen. A failed notification doesn't undo the status change.
  await prismaClient.notification
    .create({
      data: {
        userId: request.userId,
        type: NotificationType.PROPERTY_REQUEST_UPDATED,
        title: STATUS_LABELS[status],
        body: note ?? defaultMessage(status, request.type, request.property.name),
        notificationStatus: "SENT",
        sentAt: new Date(),
        meta: {
          channel: "in_app",
          propertyRequestId: id,
          propertyName: request.property.name,
          reference: request.reference,
          status,
        },
      },
    })
    .catch((error) =>
      logger.error(`Could not notify the client about ${request.reference}: ${error}`),
    );
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
              kind: PropertyUpdateKind.PROGRESS,
              title: "Payment received",
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
            create: {
              status: payment.request.status,
              kind: PropertyUpdateKind.PROGRESS,
              title: "Payment not successful",
              note: "Payment was not successful",
            },
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

/** An admin's "Purchase notice": a titled message on the request, without a status change. */
export const addPropertyRequestNotice = async (id: string, title: string, message: string) => {
  const request = await prismaClient.propertyRequest.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!request) return null;
  return prismaClient.propertyRequest.update({
    where: { id },
    data: {
      updates: {
        create: { status: request.status, kind: PropertyUpdateKind.NOTICE, title, note: message },
      },
    },
    select: requestSelect,
  });
};

const documentSelect = {
  id: true,
  name: true,
  source: true,
  fileName: true,
  fileType: true,
  fileSizeBytes: true,
  publicId: true,
  resourceType: true,
  format: true,
  createdAt: true,
} satisfies Prisma.PropertyRequestDocumentSelect;

export type DocumentRow = Prisma.PropertyRequestDocumentGetPayload<{
  select: typeof documentSelect;
}>;

/** A request's documents, oldest first. */
export const listPropertyRequestDocuments = (requestId: string) =>
  prismaClient.propertyRequestDocument.findMany({
    where: { requestId },
    orderBy: { createdAt: "asc" },
    select: documentSelect,
  });

export const addPropertyRequestDocument = (
  data: Omit<Prisma.PropertyRequestDocumentUncheckedCreateInput, "id" | "createdAt">,
) => prismaClient.propertyRequestDocument.create({ data, select: documentSelect });

/** Whether a request exists (and, for a client, is theirs). */
export const propertyRequestExists = async (id: string, userId?: string) =>
  (await prismaClient.propertyRequest.count({ where: { id, ...(userId ? { userId } : {}) } })) > 0;
