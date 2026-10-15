import { NotificationType, Prisma } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { inAppFor } from "../../../../services/database/notifications";

const updateSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  meta: true,
  read: true,
  verificationRequestId: true,
  createdAt: true,
  verificationType: { select: { name: true, slug: true } },
  verificationRequest: { select: { details: true } },
} satisfies Prisma.NotificationSelect;

type UpdateRow = Prisma.NotificationGetPayload<{ select: typeof updateSelect }>;

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** What the request is about: the property, business or construction site. */
const subjectOf = (details: Prisma.JsonValue | undefined) => {
  const d = (
    details && typeof details === "object" && !Array.isArray(details) ? details : {}
  ) as Record<string, unknown>;
  return (
    text(d.propertyName) ??
    text(d.businessName) ??
    text(d.propertyAddress) ??
    text(d.constructionAddress) ??
    text(d.businessAddress)
  );
};

/** One card on the client's Updates screen, worded from the notification's type. */
export const toClientUpdate = ({
  verificationType,
  verificationRequest,
  meta,
  ...row
}: UpdateRow) => {
  const m = (meta ?? {}) as Record<string, unknown>;
  const typeName = verificationType?.name ?? "Verification";
  const subject = subjectOf(verificationRequest?.details);
  const yourRequest = subject ? `your ${subject}` : `your ${typeName.toLowerCase()}`;
  const agentName = text(m.agentName);

  const worded: Partial<Record<NotificationType, { title: string; body: string }>> = {
    [NotificationType.VERIFICATION_REQUEST_CREATED]: {
      title: "Verification Request Submitted",
      body: `Your ${typeName.toLowerCase()} request${subject ? ` for ${subject}` : ""} has been submitted`,
    },
    [NotificationType.AGENT_ASSIGNED]: {
      title: "New Agent Assigned",
      body: `${agentName ?? "An agent"} has been assigned to ${yourRequest} verification`,
    },
    [NotificationType.INSPECTION_STARTED]: {
      title: "Inspection Started",
      body: `Inspection has started for ${yourRequest} verification`,
    },
    [NotificationType.REPORT_UPLOADED]: {
      title: `${typeName} Complete`,
      body: `Your ${typeName.toLowerCase()} report${subject ? ` for ${subject}` : ""} is ready`,
    },
  };

  return {
    id: row.id,
    type: row.type,
    // Payments (and anything not listed above) keep their stored wording, which has the amount.
    title: worded[row.type]?.title ?? row.title,
    body: worded[row.type]?.body ?? row.body,
    verificationType,
    subjectName: subject,
    verificationRequestId: row.verificationRequestId,
    reportId: text(m.reportId),
    read: row.read,
    createdAt: row.createdAt,
  };
};

/** The client's Updates screen: their in-app notifications, newest first, plus the unread count. */
export const getClientUpdates = async (
  userId: string,
  { page, limit, unreadOnly }: { page: number; limit: number; unreadOnly: boolean },
) => {
  const where = { ...inAppFor(userId), ...(unreadOnly ? { read: false } : {}) };
  const [totalItems, unreadCount, rows] = await Promise.all([
    prismaClient.notification.count({ where }),
    prismaClient.notification.count({ where: { ...inAppFor(userId), read: false } }),
    prismaClient.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: updateSelect,
    }),
  ]);
  return {
    data: rows.map(toClientUpdate),
    unreadCount,
    meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
  };
};
