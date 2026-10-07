import {
  AgentStatus,
  PaymentStatus,
  Prisma,
  ReportReviewStatus,
  ROLE,
  UserStatus,
} from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { OPEN_ASSIGNMENT_STATUSES } from "../../../authentication/services/database/agent";
import { propertySelect } from "./property";

export type UserListType = "all" | "client" | "agent";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Completed reports matching `where`, and the average days from the agent being assigned
 * (the payment's assignedAt) to the report being generated, to 1 decimal place.
 */
const completedReports = async (where: Prisma.VerificationReportWhereInput) => {
  const reports = await prismaClient.verificationReport.findMany({
    where: { ...where, generatedAt: { not: null } },
    select: { generatedAt: true, transaction: { select: { assignedAt: true } } },
  });
  const durations = reports.flatMap(({ generatedAt, transaction }) =>
    generatedAt && transaction?.assignedAt ? [+generatedAt - +transaction.assignedAt] : [],
  );
  const average = durations.length
    ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length / DAY_MS) * 10) / 10
    : null;
  return { count: reports.length, averageDays: average };
};

/** User Management list: clients and agents (admins are left out). */
export const getUsers = async (type: UserListType, search: string, page: number, limit: number) => {
  const term = search.trim();
  const baseWhere: Prisma.UserWhereInput = term
    ? {
        OR: ["fullName", "email", "phone"].map((field) => ({
          [field]: { contains: term, mode: "insensitive" },
        })),
      }
    : {};
  const roleWhere = (role?: ROLE): Prisma.UserWhereInput => ({
    ...baseWhere,
    role: role ?? { in: [ROLE.CLIENT, ROLE.AGENT] },
  });
  const where = roleWhere(
    type === "client" ? ROLE.CLIENT : type === "agent" ? ROLE.AGENT : undefined,
  );

  const [data, totalItems, all, client, agent] = await Promise.all([
    prismaClient.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        profilePhoto: true,
        role: true,
        status: true,
        createdAt: true,
        verificationAgent: { select: { id: true, status: true } },
      },
    }),
    prismaClient.user.count({ where }),
    prismaClient.user.count({ where: roleWhere() }),
    prismaClient.user.count({ where: roleWhere(ROLE.CLIENT) }),
    prismaClient.user.count({ where: roleWhere(ROLE.AGENT) }),
  ]);
  return {
    data,
    meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    counts: { all, client, agent },
  };
};

/** The User Profile page for a client. */
export const getClientProfile = async (id: string) => {
  const user = await prismaClient.user.findFirst({
    where: { id, role: ROLE.CLIENT },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      location: true,
      profilePhoto: true,
      status: true,
      createdAt: true,
    },
  });
  if (!user) return null;

  const paid = { status: PaymentStatus.SUCCESS };
  const [requests, spent, reports, activity] = await Promise.all([
    prismaClient.verificationRequest.count({ where: { userId: id, transactions: { some: paid } } }),
    prismaClient.transaction.aggregate({
      where: { ...paid, verificationRequest: { userId: id } },
      _sum: { amountInCents: true },
    }),
    completedReports({ verificationRequest: { userId: id } }),
    prismaClient.activityLog.findMany({
      where: { verificationRequest: { userId: id } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        subjectName: true,
        verificationRequestId: true,
        createdAt: true,
      },
    }),
  ]);
  return {
    user,
    stats: {
      paidRequests: requests,
      totalSpent: (spent._sum.amountInCents ?? 0) / 100,
      averageResponseDays: reports.averageDays,
    },
    recentActivity: activity,
  };
};

/** The Agent Profile page. */
export const getAgentProfile = async (id: string) => {
  const agent = await prismaClient.verificationAgent.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      region: true,
      status: true,
      createdAt: true,
      user: { select: { id: true, email: true, phone: true, profilePhoto: true, status: true } },
    },
  });
  if (!agent) return null;

  const [activeAssignments, properties, completed, reviewed, approved] = await Promise.all([
    prismaClient.agentAssignment.count({
      where: { agentId: id, status: { in: OPEN_ASSIGNMENT_STATUSES } },
    }),
    // "Assigned Properties": listings assigned to the agent with "Assign Property".
    prismaClient.property.findMany({
      where: { agentId: id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: propertySelect,
    }),
    completedReports({ submittedByAgentId: id }),
    prismaClient.verificationReport.count({
      where: { submittedByAgentId: id, reviewStatus: { not: ReportReviewStatus.PENDING } },
    }),
    prismaClient.verificationReport.count({
      where: { submittedByAgentId: id, reviewStatus: ReportReviewStatus.APPROVED },
    }),
  ]);
  return {
    agent,
    suspended: agent.status === AgentStatus.INACTIVE || agent.user.status === UserStatus.SUSPENDED,
    activeAssignments,
    properties,
    stats: {
      totalVerifications: completed.count,
      successRate: reviewed ? Math.round((approved / reviewed) * 100) : null,
      averageResponseDays: completed.averageDays,
    },
  };
};

export const findUserForStatusChange = (id: string) =>
  prismaClient.user.findUnique({
    where: { id },
    select: { id: true, role: true, verificationAgent: { select: { id: true } } },
  });

export const setUserStatus = (id: string, status: UserStatus) =>
  prismaClient.user.update({ where: { id }, data: { status }, select: { id: true, status: true } });
