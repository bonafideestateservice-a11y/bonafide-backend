import {
  AgentStatus,
  PaymentStatus,
  PropertyStatus,
  ROLE,
  VerificationStatus,
} from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DashboardStats {
  totalUsers: number;
  numberOfPendingRequest: number;
  numberOfActiveAgents: number;
  numberOfProperties: number;
  /** % change of each value vs exactly 7 days ago; null when that value was 0. */
  trends: Record<
    "totalUsers" | "numberOfPendingRequest" | "numberOfActiveAgents" | "numberOfProperties",
    number | null
  >;
  comparedTo: "last_week";
}

// Each card's value at a point in time, so it can be compared with 7 days earlier.
const usersAt = (at: Date) =>
  prismaClient.user.count({ where: { role: ROLE.CLIENT, createdAt: { lte: at } } });

/** Paid requests waiting for an agent: a paid period not yet assigned at that time. */
const pendingAt = (at: Date) =>
  prismaClient.verificationRequest.count({
    where: {
      status: { not: VerificationStatus.CANCELLED },
      transactions: {
        some: {
          status: PaymentStatus.SUCCESS,
          paidAt: { lte: at },
          OR: [{ assignedAt: null }, { assignedAt: { gt: at } }],
        },
      },
    },
  });

const activeAgentsAt = (at: Date) =>
  prismaClient.verificationAgent.count({
    where: {
      createdAt: { lte: at },
      OR: [{ deactivatedAt: null }, { deactivatedAt: { gt: at } }],
    },
  });

const verifiedPropertiesAt = (at: Date) =>
  prismaClient.property.count({ where: { verifiedAt: { lte: at } } });

const change = (now: number, before: number) =>
  before === 0 ? null : Math.round(((now - before) / before) * 1000) / 10;

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const [
    totalUsers,
    numberOfPendingRequest,
    numberOfActiveAgents,
    numberOfProperties,
    pendingNow,
    activeNow,
    verifiedNow,
    ...before
  ] = await Promise.all([
    usersAt(now),
    prismaClient.verificationRequest.count({ where: { status: VerificationStatus.SUBMITTED } }),
    prismaClient.verificationAgent.count({ where: { status: AgentStatus.ACTIVE } }),
    prismaClient.property.count({ where: { status: PropertyStatus.VERIFIED } }),
    pendingAt(now),
    activeAgentsAt(now),
    verifiedPropertiesAt(now),
    usersAt(weekAgo),
    pendingAt(weekAgo),
    activeAgentsAt(weekAgo),
    verifiedPropertiesAt(weekAgo),
  ]);
  const [usersBefore, pendingBefore, activeBefore, verifiedBefore] = before;

  return {
    totalUsers,
    numberOfPendingRequest,
    numberOfActiveAgents,
    numberOfProperties,
    trends: {
      totalUsers: change(totalUsers, usersBefore),
      numberOfPendingRequest: change(pendingNow, pendingBefore),
      numberOfActiveAgents: change(activeNow, activeBefore),
      numberOfProperties: change(verifiedNow, verifiedBefore),
    },
    comparedTo: "last_week",
  };
};

export const analyticsRanges = ["this_week", "last_week", "this_month"] as const;
export type AnalyticsRange = (typeof analyticsRanges)[number];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Requests paid per day (successful payments by paidAt, UTC) for the analytics chart. */
export const getDashboardAnalytics = async (range: AnalyticsRange) => {
  const today = new Date();
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const monday = midnight - ((today.getUTCDay() + 6) % 7) * DAY_MS;
  const [from, to] =
    range === "this_month"
      ? [
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
        ]
      : range === "last_week"
        ? [monday - 7 * DAY_MS, monday]
        : [monday, monday + 7 * DAY_MS];

  const payments = await prismaClient.transaction.findMany({
    where: { status: PaymentStatus.SUCCESS, paidAt: { gte: new Date(from), lt: new Date(to) } },
    select: { paidAt: true },
  });

  const points = Array.from({ length: Math.round((to - from) / DAY_MS) }, (_, index) => {
    const day = new Date(from + index * DAY_MS);
    const date = day.toISOString().slice(0, 10);
    return {
      label: range === "this_month" ? String(day.getUTCDate()) : WEEKDAYS[index],
      date,
      count: payments.filter((payment) => payment.paidAt?.toISOString().startsWith(date)).length,
    };
  });

  return {
    range,
    from: new Date(from).toISOString(),
    to: new Date(to - 1).toISOString(),
    points,
  };
};
