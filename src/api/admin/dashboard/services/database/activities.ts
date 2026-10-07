import { prismaClient } from "../../../../../utils/prisma";

/** The admin dashboard's "Recent activity" feed, newest first. */
export const getActivities = async (page: number, limit: number) => {
  const [totalItems, data] = await Promise.all([
    prismaClient.activityLog.count(),
    prismaClient.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        type: true,
        subjectName: true,
        verificationRequestId: true,
        createdAt: true,
      },
    }),
  ]);
  return { data, meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } };
};
