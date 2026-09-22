import { AgentAssignmentStatus, Prisma, VerificationStatus } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export type VerificationRequestListStatus =
  "all" | "pending" | "assigned" | "in_progress" | "completed";

export type VerificationRequestSortBy = "createdAt" | "status";
export type VerificationRequestSortOrder = "asc" | "desc";

export interface GetVerificationRequestsQuery {
  status?: VerificationRequestListStatus;
  search?: string;
  verificationTypeId?: string;
  agentId?: string;
  page?: number;
  limit?: number;
  sortBy?: VerificationRequestSortBy;
  sortOrder?: VerificationRequestSortOrder;
  propertyType?: string;
}

const requestSelect = {
  id: true,
  status: true,
  details: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: { id: true, fullName: true, email: true, profilePhoto: true },
  },
  verificationType: {
    select: { id: true, name: true, slug: true },
  },
  agentAssignment: {
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      agent: {
        select: { id: true, name: true, region: true },
      },
    },
  },
  transactions: {
    select: { status: true, amountInCents: true, currency: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.VerificationRequestSelect;

export type AdminVerificationRequest = Prisma.VerificationRequestGetPayload<{
  select: typeof requestSelect;
}>;

export interface VerificationRequestListResult {
  data: AdminVerificationRequest[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
  counts: {
    all: number;
    pending: number;
    assigned: number;
    inProgress: number;
    completed: number;
  };
}

const getStatusFilter = (
  status: VerificationRequestListStatus | undefined,
  agentId?: string,
): Prisma.VerificationRequestWhereInput => {
  switch (status) {
    case "pending":
      return { status: VerificationStatus.SUBMITTED };
    case "assigned":
      return {
        agentAssignment: {
          status: AgentAssignmentStatus.ASSIGNED,
          ...(agentId ? { agentId } : {}),
        },
      };
    case "in_progress":
      return {
        OR: [
          { status: VerificationStatus.IN_PROGRESS },
          {
            agentAssignment: {
              status: {
                in: [AgentAssignmentStatus.ACCEPTED, AgentAssignmentStatus.INSPECTION_SCHEDULED],
              },
              ...(agentId ? { agentId } : {}),
            },
          },
        ],
        ...(agentId ? { agentAssignment: { agentId } } : {}),
      };
    case "completed":
      return { status: VerificationStatus.COMPLETED };
    default:
      return {};
  }
};

export const getVerificationRequestsForAdmin = async ({
  status = "all",
  search = "",
  verificationTypeId,
  agentId,
  page = 1,
  limit = 10,
  sortBy = "createdAt",
  sortOrder = "desc",
  propertyType,
}: GetVerificationRequestsQuery = {}): Promise<VerificationRequestListResult> => {
  const normalizedSearch = search.trim();
  const baseWhere: Prisma.VerificationRequestWhereInput = {
    ...(verificationTypeId ? { verificationTypeId } : {}),
    ...(agentId ? { agentAssignment: { agentId } } : {}),
    ...(propertyType ? { details: { path: ["propertyType"], equals: propertyType } } : {}),
    ...(normalizedSearch
      ? {
          OR: [
            { user: { fullName: { contains: normalizedSearch, mode: "insensitive" } } },
            { verificationType: { name: { contains: normalizedSearch, mode: "insensitive" } } },
            {
              details: {
                path: ["propertyAddress"],
                string_contains: normalizedSearch,
              },
            },
            {
              details: {
                path: ["constructionAddress"],
                string_contains: normalizedSearch,
              },
            },
            {
              details: {
                path: ["businessAddress"],
                string_contains: normalizedSearch,
              },
            },
          ],
        }
      : {}),
  };
  const statusFilter = getStatusFilter(status, agentId);
  const where: Prisma.VerificationRequestWhereInput = {
    AND: [baseWhere, statusFilter],
  };
  const countStatuses: Array<
    [keyof VerificationRequestListResult["counts"], VerificationRequestListStatus | undefined]
  > = [
    ["all", "all"],
    ["pending", "pending"],
    ["assigned", "assigned"],
    ["inProgress", "in_progress"],
    ["completed", "completed"],
  ];

  try {
    const skip = (page - 1) * limit;
    const [total, data, ...countResults] = await Promise.all([
      prismaClient.verificationRequest.count({ where }),
      prismaClient.verificationRequest.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        select: requestSelect,
      }),
      ...countStatuses.map(([, countStatus]) =>
        prismaClient.verificationRequest.count({
          where: {
            AND: [baseWhere, getStatusFilter(countStatus, agentId)],
          },
        }),
      ),
    ]);

    logger.info(`Fetched admin verification requests count=${data.length} total=${total}`);
    const counts = countStatuses.reduce(
      (result, [key], index) => ({ ...result, [key]: countResults[index] }),
      {} as VerificationRequestListResult["counts"],
    );

    return {
      data,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
      counts,
    };
  } catch (error) {
    logger.error(`Error fetching admin verification requests ${error}`);
    throw error;
  }
};
