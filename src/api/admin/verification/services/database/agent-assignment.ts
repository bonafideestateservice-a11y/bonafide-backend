import {
  DocumentType,
  AgentAssignmentStatus,
  AgentStatus,
  Prisma,
  SiteVisitStatus,
  UserStatus,
  VerificationStatus,
} from "@prisma/client";
import { appEvents, AppEventTypes } from "../../../../../events";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";
import { verificationReportChecklistLabels } from "../../../../services/verification-report-checklist";
import {
  getSiteVisitNumberFromSectionKey,
  getVerificationReportSections,
  isVerificationReportSectionComplete,
  VerificationReportSectionResult,
} from "../../../../services/verification-report-sections";
import { findUnreportedPaidTransaction } from "../../../../services/database/verification-lifecycle";
import {
  MAX_ACTIVE_ASSIGNMENTS,
  OPEN_ASSIGNMENT_STATUSES,
} from "../../../authentication/services/database/agent";

export type AgentAssignmentInformation = Prisma.AgentAssignmentGetPayload<{
  select: {
    id: true;
    status: true;
    progressPercent: true;
    additionalNotes: true;
    scheduledAt: true;
    completedAt: true;
    agent: { select: { id: true; name: true; region: true } };
    verificationRequest: {
      select: {
        id: true;
        status: true;
        details: true;
        user: { select: { id: true; fullName: true; email: true } };
        verificationType: { select: { name: true; slug: true } };
      };
    };
    checklistItems: {
      select: { id: true; label: true; status: true; sortOrder: true };
      orderBy: { sortOrder: "asc" };
    };
  };
}>;

export interface AgentAssignmentStats {
  totalAgents: number;
  activeAgents: number;
  totalAssignments: number;
  averageProgressPercent: number;
  assignmentsByStatus: Record<AgentAssignmentStatus, number>;
}

export interface AgentSelfStats {
  activeCount: number;
  completedCount: number;
  avgRating: number;
}

export type AgentSelfAssignment = Prisma.AgentAssignmentGetPayload<{
  select: {
    id: true;
    status: true;
    progressPercent: true;
    scheduledAt: true;
    verificationRequest: {
      select: {
        details: true;
        user: { select: { fullName: true } };
        verificationType: { select: { name: true } };
      };
    };
  };
}>;

export interface AgentAssignmentsFilter {
  limit?: number;
  status?: "ALL" | "IN_PROGRESS";
  search?: string;
}

export interface CreateAgentAssignmentData {
  verificationRequestId: string;
  agentId: string;
}

export const createAgentAssignment = async ({
  verificationRequestId,
  agentId,
}: CreateAgentAssignmentData) => {
  try {
    const paidPeriod = await findUnreportedPaidTransaction(prismaClient, verificationRequestId);
    const assignment = await prismaClient.agentAssignment.create({
      data: { verificationRequestId, agentId, transactionId: paidPeriod?.id ?? null },
    });
    if (paidPeriod) {
      await prismaClient.transaction.update({
        where: { id: paidPeriod.id },
        data: { assignedAt: new Date() },
      });
    }

    appEvents.emit(AppEventTypes.AGENT_ASSIGNED, {
      assignmentId: assignment.id,
      verificationRequestId: assignment.verificationRequestId,
      agentId: assignment.agentId,
    });

    return assignment;
  } catch (error) {
    logger.error(
      `Error creating agent assignment verificationRequestId=${verificationRequestId} agentId=${agentId} ${error}`,
    );
    throw error;
  }
};

const assignedAgentSelect = {
  id: true,
  status: true,
  createdAt: true,
  agent: { select: { id: true, name: true } },
} satisfies Prisma.AgentAssignmentSelect;

export type AssignAgentResult =
  | { kind: "REQUEST_NOT_FOUND" }
  | { kind: "AGENT_NOT_FOUND" }
  | { kind: "AGENT_INACTIVE" }
  | { kind: "AGENT_FULLY_BOOKED" }
  | { kind: "REQUEST_NOT_ASSIGNABLE"; status: VerificationStatus }
  | { kind: "NO_PAID_PERIOD" }
  | { kind: "ALREADY_ASSIGNED"; agentId: string }
  | {
      kind: "ASSIGNED";
      assignment: Prisma.AgentAssignmentGetPayload<{ select: typeof assignedAgentSelect }>;
    };

/**
 * Assign an agent to a paid verification request. Only SUBMITTED requests (paid
 * and waiting for an agent) can be assigned; the request moves to IN_PROGRESS.
 * The assignment covers the oldest paid period that has no report yet.
 */
export const assignAgentToVerificationRequest = async (
  verificationRequestId: string,
  agentId: string,
): Promise<AssignAgentResult> => {
  try {
    const result = await prismaClient.$transaction(async (transaction) => {
      const verificationRequest = await transaction.verificationRequest.findUnique({
        where: { id: verificationRequestId },
        select: { status: true, agentAssignment: { select: { agentId: true } } },
      });
      if (!verificationRequest) return { kind: "REQUEST_NOT_FOUND" as const };

      if (verificationRequest.agentAssignment) {
        return {
          kind: "ALREADY_ASSIGNED" as const,
          agentId: verificationRequest.agentAssignment.agentId,
        };
      }

      if (verificationRequest.status !== VerificationStatus.SUBMITTED) {
        return { kind: "REQUEST_NOT_ASSIGNABLE" as const, status: verificationRequest.status };
      }

      const agent = await transaction.verificationAgent.findUnique({
        where: { id: agentId },
        select: { status: true },
      });
      if (!agent) return { kind: "AGENT_NOT_FOUND" as const };
      if (agent.status !== AgentStatus.ACTIVE) return { kind: "AGENT_INACTIVE" as const };
      const openJobs = await transaction.agentAssignment.count({
        where: { agentId, status: { in: OPEN_ASSIGNMENT_STATUSES } },
      });
      if (openJobs >= MAX_ACTIVE_ASSIGNMENTS) return { kind: "AGENT_FULLY_BOOKED" as const };

      const paidPeriod = await findUnreportedPaidTransaction(transaction, verificationRequestId);
      if (!paidPeriod) return { kind: "NO_PAID_PERIOD" as const };

      // Guards against the status changing (e.g. a refund) since it was read.
      const moved = await transaction.verificationRequest.updateMany({
        where: { id: verificationRequestId, status: VerificationStatus.SUBMITTED },
        data: { status: VerificationStatus.IN_PROGRESS },
      });
      if (moved.count === 0) {
        return { kind: "REQUEST_NOT_ASSIGNABLE" as const, status: verificationRequest.status };
      }

      const assignment = await transaction.agentAssignment.create({
        data: { verificationRequestId, agentId, transactionId: paidPeriod.id },
        select: assignedAgentSelect,
      });
      await transaction.transaction.update({
        where: { id: paidPeriod.id },
        data: { assignedAt: new Date() },
      });
      return { kind: "ASSIGNED" as const, assignment };
    }, { maxWait: 5000, timeout: 20000 });

    if (result.kind === "ASSIGNED") {
      appEvents.emit(AppEventTypes.AGENT_ASSIGNED, {
        assignmentId: result.assignment.id,
        verificationRequestId,
        agentId,
      });
      logger.info(
        `Agent assigned verificationRequestId=${verificationRequestId} agentId=${agentId} assignmentId=${result.assignment.id}`,
      );
    }

    return result;
  } catch (error) {
    // Two admins assigning at once: the unique constraint on verificationRequestId wins.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prismaClient.agentAssignment.findUnique({
        where: { verificationRequestId },
        select: { agentId: true },
      });
      return { kind: "ALREADY_ASSIGNED", agentId: existing?.agentId ?? agentId };
    }
    logger.error(
      `Error assigning agent verificationRequestId=${verificationRequestId} agentId=${agentId} ${error}`,
    );
    throw error;
  }
};

export type UnassignAgentResult = "UNASSIGNED" | "NOT_ASSIGNED" | "REPORT_SUBMITTED";

/**
 * Remove the agent from a request that hasn't been reported yet. The paid period goes back to
 * waiting for an agent (request SUBMITTED, the payment's assignedAt cleared) and any checklist
 * progress is discarded.
 */
export const unassignAgentFromVerificationRequest = (verificationRequestId: string) =>
  prismaClient.$transaction(async (transaction): Promise<UnassignAgentResult> => {
    const assignment = await transaction.agentAssignment.findUnique({
      where: { verificationRequestId },
      select: { id: true, status: true, transactionId: true },
    });
    if (!assignment) return "NOT_ASSIGNED";
    if (
      assignment.status === AgentAssignmentStatus.INSPECTION_COMPLETE ||
      assignment.status === AgentAssignmentStatus.REPORT_SUBMITTED
    ) {
      return "REPORT_SUBMITTED";
    }

    await transaction.verificationChecklistItem.deleteMany({
      where: { agentAssignmentId: assignment.id },
    });
    await transaction.agentAssignment.delete({ where: { id: assignment.id } });
    if (assignment.transactionId) {
      await transaction.transaction.update({
        where: { id: assignment.transactionId },
        data: { assignedAt: null },
      });
    }
    await transaction.verificationRequest.updateMany({
      where: { id: verificationRequestId, status: VerificationStatus.IN_PROGRESS },
      data: { status: VerificationStatus.SUBMITTED },
    });
    return "UNASSIGNED";
  });

/**
 * Suspend (INACTIVE) or reactivate (ACTIVE) an agent. Suspending moves each open assignment to
 * the active agent with the fewest open jobs who still has room; when nobody has room, the job is
 * unassigned so an admin can assign it later. Null when the agent doesn't exist.
 */
export const setAgentStatus = async (agentId: string, status: AgentStatus) => {
  const agent = await prismaClient.verificationAgent.findUnique({ where: { id: agentId } });
  if (!agent) return null;

  const suspended = status === AgentStatus.INACTIVE;
  await prismaClient.$transaction([
    prismaClient.verificationAgent.update({
      where: { id: agentId },
      data: { status, deactivatedAt: suspended ? new Date() : null },
    }),
    // A suspended agent can't log in either.
    prismaClient.user.update({
      where: { id: agent.userId },
      data: { status: suspended ? UserStatus.SUSPENDED : UserStatus.ACTIVE },
    }),
  ]);
  const result = { id: agentId, status, reassigned: 0, unassigned: 0 };
  if (status === AgentStatus.ACTIVE) return result;

  const [openAssignments, others] = await Promise.all([
    prismaClient.agentAssignment.findMany({
      where: { agentId, status: { in: OPEN_ASSIGNMENT_STATUSES } },
      select: { id: true, verificationRequestId: true },
    }),
    prismaClient.verificationAgent.findMany({
      where: { id: { not: agentId }, status: AgentStatus.ACTIVE },
      select: {
        id: true,
        _count: {
          select: { assignments: { where: { status: { in: OPEN_ASSIGNMENT_STATUSES } } } },
        },
      },
    }),
  ]);
  const load = new Map(others.map((other) => [other.id, other._count.assignments]));

  for (const assignment of openAssignments) {
    const [next] = [...load]
      .filter(([, jobs]) => jobs < MAX_ACTIVE_ASSIGNMENTS)
      .sort((a, b) => a[1] - b[1]);
    if (!next) {
      await unassignAgentFromVerificationRequest(assignment.verificationRequestId);
      result.unassigned += 1;
      continue;
    }
    // The new agent starts the inspection afresh.
    await prismaClient.$transaction([
      prismaClient.verificationChecklistItem.deleteMany({
        where: { agentAssignmentId: assignment.id },
      }),
      prismaClient.agentAssignment.update({
        where: { id: assignment.id },
        data: { agentId: next[0], status: AgentAssignmentStatus.ASSIGNED, progressPercent: null },
      }),
    ]);
    load.set(next[0], next[1] + 1);
    result.reassigned += 1;
    appEvents.emit(AppEventTypes.AGENT_ASSIGNED, {
      assignmentId: assignment.id,
      verificationRequestId: assignment.verificationRequestId,
      agentId: next[0],
    });
  }
  return result;
};

export type AgentAssignmentDetail = Prisma.AgentAssignmentGetPayload<{
  select: {
    id: true;
    status: true;
    scheduledAt: true;
    agentId: true;
    transaction: { select: { status: true; amountInCents: true; currency: true } };
    verificationRequest: {
      select: {
        details: true;
        user: { select: { fullName: true; phone: true; email: true } };
        verificationType: { select: { name: true } };
        transactions: {
          select: { status: true; amountInCents: true; currency: true };
          orderBy: { createdAt: "desc" };
          take: 1;
        };
      };
    };
  };
}>;

export const getAgentAssignmentById = async (
  agentId: string,
  assignmentId: string,
): Promise<AgentAssignmentDetail | null> => {
  try {
    return await prismaClient.agentAssignment.findFirst({
      where: { id: assignmentId, agentId },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        agentId: true,
        transaction: { select: { status: true, amountInCents: true, currency: true } },
        verificationRequest: {
          select: {
            details: true,
            user: { select: { fullName: true, phone: true, email: true } },
            verificationType: { select: { name: true } },
            transactions: {
              select: { status: true, amountInCents: true, currency: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
  } catch (error) {
    logger.error(
      `Error fetching assignment detail assignmentId=${assignmentId} agentId=${agentId} ${error}`,
    );
    throw error;
  }
};

export type StartedAgentAssignment = {
  id: string;
  status: AgentAssignmentStatus;
  checklist: {
    id: string;
    label: string;
    sectionKey: string | null;
    status: "PENDING";
    requiresMedia: boolean;
    fields: { key: string; label: string; type: "text" | "number" }[];
  }[];
};

export const startAgentAssignment = async (
  agentId: string,
  assignmentId: string,
): Promise<StartedAgentAssignment | null> => {
  try {
    let startedEvent: { assignmentId: string; verificationRequestId: string } | undefined;
    const result = await prismaClient.$transaction(
      async (transaction) => {
        const assignment = await transaction.agentAssignment.findFirst({
          where: { id: assignmentId, agentId },
          select: {
            id: true,
            verificationRequestId: true,
            status: true,
            verificationRequest: {
              select: { verificationTier: { select: { code: true } } },
            },
            transaction: {
              select: {
                subscriptionPeriod: {
                  select: { requiredSiteVisits: true },
                },
              },
            },
            checklistItems: {
              select: {
                id: true,
                label: true,
                sectionKey: true,
                result: true,
                status: true,
                sortOrder: true,
                media: { select: { id: true } },
              },
              orderBy: { sortOrder: "asc" },
            },
          },
        });

        if (!assignment) return null;

        const tierCode = assignment.verificationRequest.verificationTier?.code;
        const requiredSiteVisits =
          assignment.transaction?.subscriptionPeriod?.requiredSiteVisits ?? 1;
        const reportSections = getVerificationReportSections(tierCode, requiredSiteVisits);
        if (reportSections) {
          const legacySiteVisit = assignment.checklistItems.find(
            (item) => item.sectionKey === "site_visit",
          );
          if (
            requiredSiteVisits > 1 &&
            legacySiteVisit &&
            !assignment.checklistItems.some((item) => item.sectionKey === "site_visit_1")
          ) {
            await transaction.verificationChecklistItem.update({
              where: { id: legacySiteVisit.id },
              data: {
                sectionKey: "site_visit_1",
                label: reportSections[0].label,
              },
            });
          }
          const existingSectionKeys = new Set(
            assignment.checklistItems
              .map((item) => item.sectionKey)
              .filter((key): key is string => key !== null)
              .map((key) =>
                requiredSiteVisits > 1 && key === "site_visit" ? "site_visit_1" : key,
              ),
          );
          const missingSections = reportSections.filter(
            (section) => !existingSectionKeys.has(section.key),
          );
          if (missingSections.length > 0) {
            await transaction.verificationChecklistItem.createMany({
              data: missingSections.map((section, index) => ({
                agentAssignmentId: assignment.id,
                label: section.label,
                sectionKey: section.key,
                sortOrder: assignment.checklistItems.length + index,
              })),
            });
          }
        } else if (assignment.checklistItems.length === 0) {
          await transaction.verificationChecklistItem.createMany({
            data: verificationReportChecklistLabels.map((label, sortOrder) => ({
              agentAssignmentId: assignment.id,
              label,
              sortOrder,
            })),
          });
        }

        const status =
          assignment.status === AgentAssignmentStatus.ASSIGNED
            ? AgentAssignmentStatus.ACCEPTED
            : assignment.status;

        if (status === AgentAssignmentStatus.ACCEPTED) {
          startedEvent = {
            assignmentId: assignment.id,
            verificationRequestId: assignment.verificationRequestId,
          };
        }

        const checklistItems = await transaction.verificationChecklistItem.findMany({
          where: {
            agentAssignmentId: assignment.id,
            ...(reportSections
              ? { sectionKey: { in: reportSections.map((section) => section.key) } }
              : {}),
          },
          select: {
            id: true,
            label: true,
            sectionKey: true,
            result: true,
            status: true,
            sortOrder: true,
            media: { select: { id: true } },
          },
          orderBy: { sortOrder: "asc" },
        });
        const completedItems = checklistItems.filter((item) => {
          const section = reportSections?.find((candidate) => candidate.key === item.sectionKey);
          return section
            ? isVerificationReportSectionComplete(
                section,
                item.status,
                item.result,
                item.media.length,
              )
            : item.status === "COMPLETE";
        }).length;
        const progressPercent = checklistItems.length
          ? Math.round((completedItems / checklistItems.length) * 100)
          : 0;
        await transaction.agentAssignment.update({
          where: { id: assignment.id },
          data: { status, progressPercent },
        });

        return {
          id: assignment.id,
          status,
          checklist: checklistItems.map((item) => ({
            id: item.id,
            label: item.label,
            sectionKey: item.sectionKey,
            status: "PENDING" as const,
            requiresMedia:
              reportSections?.find((section) => section.key === item.sectionKey)?.requiresMedia ??
              true,
            fields:
              reportSections?.find((section) => section.key === item.sectionKey)?.fields ?? [],
          })),
        };
      },
      { maxWait: 5000, timeout: 20000 },
    );

    if (startedEvent) {
      appEvents.emit(AppEventTypes.INSPECTION_STARTED, {
        ...startedEvent,
        agentId,
      });
    }

    return result;
  } catch (error) {
    logger.error(`Error starting agent assignment assignmentId=${assignmentId} ${error}`);
    throw error;
  }
};

export type AgentAssignmentChecklist = {
  checklistItems: {
    id: string;
    label: string;
    sectionKey: string | null;
    status: "PENDING" | "COMPLETE";
    result: Prisma.JsonValue;
    fields: { key: string; label: string; type: "text" | "number" }[];
    media: { id: string; url: string; fileName: string; fileType: string; fileSizeBytes: number }[];
  }[];
  verificationTier: { id: string; name: string; code: string } | null;
  period: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    requiredSiteVisits: number;
    completedSiteVisits: number;
    siteVisits: {
      id: string;
      visitNumber: number;
      status: SiteVisitStatus;
      completedAt: Date | null;
    }[];
  } | null;
  clientDocuments: {
    id: string;
    fileName: string;
    fileSizeBytes: number;
    url: string;
  }[];
  client: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  additionalNotes: string | null;
  progressPercent: number;
  payment: { status: string; amountInCents: number };
};

export const getAgentAssignmentChecklist = async (
  agentId: string,
  assignmentId: string,
): Promise<AgentAssignmentChecklist | null> => {
  try {
    const assignment = await prismaClient.agentAssignment.findFirst({
      where: { id: assignmentId, agentId },
      select: {
        id: true,
        additionalNotes: true,
        transaction: {
          select: {
            status: true,
            amountInCents: true,
            subscriptionPeriod: {
              select: {
                id: true,
                periodStart: true,
                periodEnd: true,
                requiredSiteVisits: true,
                completedSiteVisits: true,
                siteVisits: {
                  select: {
                    id: true,
                    visitNumber: true,
                    status: true,
                    completedAt: true,
                  },
                  orderBy: { visitNumber: "asc" },
                },
              },
            },
          },
        },
        checklistItems: {
          select: {
            id: true,
            label: true,
            sectionKey: true,
            result: true,
            status: true,
            media: {
              select: {
                id: true,
                url: true,
                fileName: true,
                fileType: true,
                fileSizeBytes: true,
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
        verificationRequest: {
          select: {
            verificationTier: { select: { id: true, name: true, code: true } },
            user: { select: { fullName: true, phone: true, email: true } },
            documents: {
              where: { checklistItemId: null, verificationReportId: null },
              select: { id: true, fileName: true, fileSizeBytes: true, url: true },
              orderBy: { createdAt: "asc" },
            },
            transactions: {
              select: { status: true, amountInCents: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!assignment) return null;

    const reportSections = getVerificationReportSections(
      assignment.verificationRequest.verificationTier?.code,
      assignment.transaction?.subscriptionPeriod?.requiredSiteVisits ?? 1,
    );
    const checklistItems = reportSections
      ? assignment.checklistItems.filter((item) =>
          reportSections.some((section) => section.key === item.sectionKey),
        )
      : assignment.checklistItems;
    const completedItems = checklistItems.filter((item) => {
      const section = reportSections?.find((candidate) => candidate.key === item.sectionKey);
      return section
        ? isVerificationReportSectionComplete(section, item.status, item.result, item.media.length)
        : item.status === "COMPLETE";
    }).length;
    const progressPercent = checklistItems.length
      ? Math.round((completedItems / checklistItems.length) * 100)
      : 0;
    const names = assignment.verificationRequest.user.fullName.trim().split(/\s+/);
    // The payment for this assignment's period; older assignments fall back to the latest.
    const transaction = assignment.transaction ?? assignment.verificationRequest.transactions[0];

    return {
      checklistItems: checklistItems.map((item) => ({
        ...item,
        fields: reportSections?.find((section) => section.key === item.sectionKey)?.fields ?? [],
      })),
      verificationTier: assignment.verificationRequest.verificationTier,
      period: assignment.transaction?.subscriptionPeriod ?? null,
      clientDocuments: assignment.verificationRequest.documents,
      client: {
        firstName: names[0] || "",
        lastName: names.slice(1).join(" "),
        phone: assignment.verificationRequest.user.phone ?? "",
        email: assignment.verificationRequest.user.email,
      },
      additionalNotes: assignment.additionalNotes,
      progressPercent,
      payment: transaction
        ? { status: transaction.status, amountInCents: transaction.amountInCents }
        : { status: "PENDING", amountInCents: 0 },
    };
  } catch (error) {
    logger.error(`Error fetching assignment checklist assignmentId=${assignmentId} ${error}`);
    throw error;
  }
};

export interface ChecklistMediaData {
  url: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
}

export type UpdatedAgentChecklistItem = {
  id: string;
  label: string;
  sectionKey: string | null;
  status: "PENDING" | "COMPLETE";
  result: Prisma.JsonValue;
  fields: { key: string; label: string; type: "text" | "number" }[];
  media: {
    id: string;
    url: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
  }[];
};

export type UpdateAgentChecklistItemResult =
  UpdatedAgentChecklistItem | { kind: "INVALID_SITE_VISIT_TRANSITION" } | null;

class ChecklistSiteVisitTransitionError extends Error {}

export const updateAgentChecklistItem = async (
  agentId: string,
  assignmentId: string,
  itemId: string,
  /** Leave out to keep the item's current status (e.g. when only adding photos). */
  status: "PENDING" | "COMPLETE" | undefined,
  media: ChecklistMediaData[] = [],
  result?: VerificationReportSectionResult,
): Promise<UpdateAgentChecklistItemResult> => {
  try {
    return await prismaClient.$transaction(
      async (transaction) => {
        const item = await transaction.verificationChecklistItem.findFirst({
          where: {
            id: itemId,
            agentAssignmentId: assignmentId,
            agentAssignment: { agentId },
          },
          select: {
            id: true,
            sectionKey: true,
            agentAssignment: {
              select: {
                transaction: {
                  select: {
                    subscriptionPeriod: {
                      select: { id: true, requiredSiteVisits: true },
                    },
                  },
                },
                verificationRequestId: true,
                verificationRequest: {
                  select: { verificationTier: { select: { code: true } } },
                },
              },
            },
          },
        });

        if (!item?.agentAssignment) return null;
        const { agentAssignment } = item;
        const period = agentAssignment.transaction?.subscriptionPeriod;
        const reportSections = getVerificationReportSections(
          agentAssignment.verificationRequest.verificationTier?.code,
          period?.requiredSiteVisits ?? 1,
        );
        const siteVisitNumber = getSiteVisitNumberFromSectionKey(item.sectionKey);
        const siteVisitSection = reportSections?.find((section) => section.key === item.sectionKey);
        const siteVisit =
          period && siteVisitSection && siteVisitNumber !== null
            ? await transaction.siteVisit.findFirst({
                where: { subscriptionPeriodId: period.id, visitNumber: siteVisitNumber },
                select: { id: true, status: true },
              })
            : null;

        if (
          period &&
          siteVisitSection &&
          siteVisitNumber !== null &&
          (!siteVisit || (status === "COMPLETE" && siteVisit.status === SiteVisitStatus.CANCELLED))
        ) {
          return { kind: "INVALID_SITE_VISIT_TRANSITION" as const };
        }

        if (status) {
          await transaction.verificationChecklistItem.update({
            where: { id: item.id },
            data: { status, ...(result ? { result } : {}) },
          });
        } else if (result) {
          await transaction.verificationChecklistItem.update({
            where: { id: item.id },
            data: { result },
          });
        }

        if (media.length > 0) {
          await transaction.document.createMany({
            data: media.map((file) => ({
              ...file,
              verificationRequestId: agentAssignment.verificationRequestId,
              checklistItemId: item.id,
              documentType: DocumentType.CHECKLIST_MEDIA,
            })),
          });
        }

        const checklistItems = await transaction.verificationChecklistItem.findMany({
          where: { agentAssignmentId: assignmentId },
          select: {
            id: true,
            label: true,
            sectionKey: true,
            result: true,
            status: true,
            media: {
              select: {
                id: true,
                url: true,
                fileName: true,
                fileType: true,
                fileSizeBytes: true,
              },
            },
          },
        });
        const activeChecklistItems = reportSections
          ? checklistItems.filter((checklistItem) =>
              reportSections.some((section) => section.key === checklistItem.sectionKey),
            )
          : checklistItems;
        const completedItems = activeChecklistItems.filter((checklistItem) => {
          const section = reportSections?.find(
            (candidate) => candidate.key === checklistItem.sectionKey,
          );
          return section
            ? isVerificationReportSectionComplete(
                section,
                checklistItem.status,
                checklistItem.result,
                checklistItem.media.length,
              )
            : checklistItem.status === "COMPLETE";
        }).length;

        if (period && siteVisit && siteVisitSection) {
          const updatedChecklistItem = activeChecklistItems.find(
            (checklistItem) => checklistItem.id === item.id,
          );
          const isVisitComplete = Boolean(
            updatedChecklistItem &&
            isVerificationReportSectionComplete(
              siteVisitSection,
              updatedChecklistItem.status,
              updatedChecklistItem.result,
              updatedChecklistItem.media.length,
            ),
          );

          if (isVisitComplete && siteVisit.status !== SiteVisitStatus.COMPLETED) {
            const updated = await transaction.siteVisit.updateMany({
              where: {
                id: siteVisit.id,
                status: {
                  in: [
                    SiteVisitStatus.PENDING,
                    SiteVisitStatus.SCHEDULED,
                    SiteVisitStatus.IN_PROGRESS,
                  ],
                },
              },
              data: {
                status: SiteVisitStatus.COMPLETED,
                completedAt: new Date(),
              },
            });
            if (updated.count === 1) {
              await transaction.subscriptionPeriod.update({
                where: { id: period.id },
                data: {
                  completedSiteVisits: { increment: 1 },
                  status: "IN_PROGRESS",
                },
              });
            } else {
              const latestVisit = await transaction.siteVisit.findUniqueOrThrow({
                where: { id: siteVisit.id },
                select: { status: true },
              });
              if (latestVisit.status !== SiteVisitStatus.COMPLETED) {
                throw new ChecklistSiteVisitTransitionError();
              }
            }
          }
        }

        const progressPercent = activeChecklistItems.length
          ? Math.round((completedItems / activeChecklistItems.length) * 100)
          : 0;

        await transaction.agentAssignment.update({
          where: { id: assignmentId },
          data: { progressPercent },
        });

        const updatedItem = activeChecklistItems.find(
          (checklistItem) => checklistItem.id === item.id,
        );
        if (!updatedItem) return null;
        return {
          ...updatedItem,
          fields:
            reportSections?.find((section) => section.key === updatedItem.sectionKey)?.fields ?? [],
        };
      },
      { timeout: 15000 },
    );
  } catch (error) {
    if (error instanceof ChecklistSiteVisitTransitionError) {
      return { kind: "INVALID_SITE_VISIT_TRANSITION" };
    }
    logger.error(
      `Error updating checklist item itemId=${itemId} assignmentId=${assignmentId} ${error}`,
    );
    throw error;
  }
};

export const updateAgentAssignmentNotes = async (
  agentId: string,
  assignmentId: string,
  additionalNotes: string,
): Promise<boolean> => {
  try {
    const result = await prismaClient.agentAssignment.updateMany({
      where: { id: assignmentId, agentId },
      data: { additionalNotes },
    });
    return result.count > 0;
  } catch (error) {
    logger.error(`Error updating assignment notes assignmentId=${assignmentId} ${error}`);
    throw error;
  }
};

const activeAssignmentStatuses: AgentAssignmentStatus[] = [
  AgentAssignmentStatus.ASSIGNED,
  AgentAssignmentStatus.ACCEPTED,
  AgentAssignmentStatus.INSPECTION_SCHEDULED,
];

export const getAgentStatsById = async (agentId: string): Promise<AgentSelfStats> => {
  try {
    const [activeCount, completedCount, rating] = await Promise.all([
      prismaClient.agentAssignment.count({
        where: { agentId, status: { in: activeAssignmentStatuses } },
      }),
      // Reports, not assignments: recurring assignments are deleted after each period.
      prismaClient.verificationReport.count({ where: { submittedByAgentId: agentId } }),
      prismaClient.verificationReport.aggregate({
        where: { submittedByAgentId: agentId },
        _avg: { rating: true },
      }),
    ]);

    return {
      activeCount,
      completedCount,
      avgRating: Number((rating._avg.rating ?? 0).toFixed(1)),
    };
  } catch (error) {
    logger.error(`Error fetching agent stats agentId=${agentId} ${error}`);
    throw error;
  }
};

export const getAgentAssignmentsById = async (
  agentId: string,
  { limit = 5, status = "ALL", search = "" }: AgentAssignmentsFilter = {},
): Promise<AgentSelfAssignment[]> => {
  try {
    const statuses =
      status === "IN_PROGRESS"
        ? [AgentAssignmentStatus.ACCEPTED, AgentAssignmentStatus.INSPECTION_SCHEDULED]
        : [
            AgentAssignmentStatus.ASSIGNED,
            AgentAssignmentStatus.ACCEPTED,
            AgentAssignmentStatus.INSPECTION_SCHEDULED,
            AgentAssignmentStatus.INSPECTION_COMPLETE,
          ];
    const normalizedSearch = search.trim();

    return await prismaClient.agentAssignment.findMany({
      where: {
        agentId,
        status: { in: statuses },
        ...(normalizedSearch
          ? {
              OR: [
                {
                  verificationRequest: {
                    user: {
                      fullName: {
                        contains: normalizedSearch,
                        mode: "insensitive",
                      },
                    },
                  },
                },
                {
                  verificationRequest: {
                    verificationType: {
                      name: { contains: normalizedSearch, mode: "insensitive" },
                    },
                  },
                },
                {
                  verificationRequest: {
                    details: {
                      path: ["propertyAddress"],
                      string_contains: normalizedSearch,
                    },
                  },
                },
                {
                  verificationRequest: {
                    details: {
                      path: ["constructionAddress"],
                      string_contains: normalizedSearch,
                    },
                  },
                },
                {
                  verificationRequest: {
                    details: {
                      path: ["businessAddress"],
                      string_contains: normalizedSearch,
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        progressPercent: true,
        scheduledAt: true,
        verificationRequest: {
          select: {
            details: true,
            user: { select: { fullName: true } },
            verificationType: { select: { name: true } },
          },
        },
      },
    });
  } catch (error) {
    logger.error(`Error fetching agent assignments agentId=${agentId} ${error}`);
    throw error;
  }
};

export const getAllAgentAssignments = async (): Promise<AgentAssignmentInformation[]> => {
  try {
    const assignments = await prismaClient.agentAssignment.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        progressPercent: true,
        additionalNotes: true,
        scheduledAt: true,
        completedAt: true,
        agent: { select: { id: true, name: true, region: true } },
        verificationRequest: {
          select: {
            id: true,
            status: true,
            details: true,
            user: { select: { id: true, fullName: true, email: true } },
            verificationType: { select: { name: true, slug: true } },
          },
        },
        checklistItems: {
          select: { id: true, label: true, status: true, sortOrder: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    logger.info(`Fetched agent assignments count=${assignments.length}`);
    return assignments;
  } catch (error) {
    logger.error(`Error fetching agent assignments ${error}`);
    throw error;
  }
};

export const getAgentAssignmentStats = async (): Promise<AgentAssignmentStats> => {
  try {
    const [totalAgents, assignments, groupedStatuses] = await Promise.all([
      prismaClient.verificationAgent.count(),
      prismaClient.agentAssignment.findMany({
        select: { agentId: true, progressPercent: true },
      }),
      prismaClient.agentAssignment.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    const assignmentsByStatus = Object.values(AgentAssignmentStatus).reduce(
      (result, status) => {
        result[status] = groupedStatuses.find((group) => group.status === status)?._count._all ?? 0;
        return result;
      },
      {} as Record<AgentAssignmentStatus, number>,
    );
    const progressValues = assignments
      .map((assignment) => assignment.progressPercent)
      .filter((progress): progress is number => progress !== null);

    return {
      totalAgents,
      activeAgents: new Set(assignments.map((assignment) => assignment.agentId)).size,
      totalAssignments: assignments.length,
      averageProgressPercent: progressValues.length
        ? Number(
            (
              progressValues.reduce((sum, progress) => sum + progress, 0) / progressValues.length
            ).toFixed(2),
          )
        : 0,
      assignmentsByStatus,
    };
  } catch (error) {
    logger.error(`Error fetching agent assignment stats ${error}`);
    throw error;
  }
};
