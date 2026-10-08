import { Prisma } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { getDisplayStatus } from "../../handlers/get-verification-requests/get-verification-requests.v1";

export const activitySelect = {
  id: true,
  type: true,
  subjectName: true,
  clientName: true,
  agentName: true,
  amount: true,
  verificationRequestId: true,
  createdAt: true,
  verificationRequest: {
    select: {
      status: true,
      verificationType: { select: { name: true } },
      agentAssignment: { select: { status: true } },
    },
  },
  property: { select: { id: true, name: true } },
} satisfies Prisma.ActivityLogSelect;

type ActivityRow = Prisma.ActivityLogGetPayload<{ select: typeof activitySelect }>;

/** One activity row; the frontend builds the title and description from `type` and these fields. */
export const toActivityResponse = ({
  verificationRequest: request,
  property,
  ...row
}: ActivityRow) => ({
  ...row,
  amount: row.amount === null ? null : row.amount / 100,
  verificationType: request?.verificationType.name ?? null,
  // The request's current status, as on the verification requests list.
  status: request ? getDisplayStatus(request) : null,
  property: property ? { id: property.id, title: property.name } : null,
});

/** The admin dashboard's "Recent activity" feed, newest first. */
export const getActivities = async (page: number, limit: number) => {
  const [totalItems, rows] = await Promise.all([
    prismaClient.activityLog.count(),
    prismaClient.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: activitySelect,
    }),
  ]);
  return {
    data: rows.map(toActivityResponse),
    meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
  };
};
