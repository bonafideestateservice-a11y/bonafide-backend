import { Prisma, VerificationRequest, VerificationStatus } from "@prisma/client";
import { appEvents, AppEventTypes } from "../../../../../events";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export interface CreateVerificationRequestData {
  userId: string;
  verificationTypeId: string;
  verificationPlanId?: string | null;
  status?: VerificationStatus;
  details: Prisma.InputJsonValue;
  additionalNote?: string | null;
}

export interface UpdateVerificationRequestData {
  userId?: string;
  verificationTypeId?: string;
  verificationPlanId?: string | null;
  status?: VerificationStatus;
  details?: Prisma.InputJsonValue;
  additionalNote?: string | null;
  notifyOnInspectionStart?: boolean;
  notifyOnReportReady?: boolean;
}

export interface FindVerificationRequestUnique {
  id: string;
}

export type VerificationRequestSummary = Prisma.VerificationRequestGetPayload<{
  select: {
    id: true;
    details: true;
    status: true;
    updatedAt: true;
    verificationType: {
      select: {
        name: true;
        icon: true;
      };
    };
  };
}>;

export type VerificationRequestDetails = Prisma.VerificationRequestGetPayload<{
  select: {
    id: true;
    status: true;
    details: true;
    createdAt: true;
    verificationType: { select: { name: true } };
    verificationPlan: {
      select: {
        frequency: true;
        name: true;
        priceInCents: true;
        currency: true;
      };
    };
  };
}>;

export const getVerificationRequestDetailsForUser = async (
  id: string,
  userId: string,
): Promise<VerificationRequestDetails | null> => {
  try {
    const verificationRequest = await prismaClient.verificationRequest.findFirst({
      where: { id, userId },
      select: {
        id: true,
        status: true,
        details: true,
        createdAt: true,
        verificationType: { select: { name: true } },
        verificationPlan: {
          select: {
            frequency: true,
            name: true,
            priceInCents: true,
            currency: true,
          },
        },
      },
    });
    logger.info(
      `Verification request details lookup requestId=${id} userId=${userId} found=${!!verificationRequest}`,
    );
    return verificationRequest;
  } catch (error) {
    logger.error(`Error finding verification request details ${error}`);
    throw error;
  }
};

export const getVerificationRequestsForUser = async (
  userId: string,
  limit = 5,
): Promise<VerificationRequestSummary[]> => {
  try {
    const verificationRequests = await prismaClient.verificationRequest.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        details: true,
        status: true,
        updatedAt: true,
        verificationType: {
          select: {
            name: true,
            icon: true,
          },
        },
      },
    });
    logger.info(
      `Fetched verification requests for user userId=${userId} count=${verificationRequests.length}`,
    );
    return verificationRequests;
  } catch (error) {
    logger.error(`Error fetching verification requests for user ${error}`);
    throw error;
  }
};

export const createVerificationRequest = async (
  data: CreateVerificationRequestData,
): Promise<VerificationRequest> => {
  try {
    const verificationRequest = await prismaClient.verificationRequest.create({
      data,
    });
    appEvents.emit(AppEventTypes.VERIFICATION_REQUEST_CREATED, {
      verificationRequestId: verificationRequest.id,
      userId: verificationRequest.userId,
    });
    logger.info(`Verification request created successfully requestId=${verificationRequest.id}`);
    return verificationRequest;
  } catch (error) {
    logger.error(`Error creating verification request ${error}`);
    throw error;
  }
};

export const getAllVerificationRequests = async (): Promise<VerificationRequest[]> => {
  try {
    const verificationRequests = await prismaClient.verificationRequest.findMany({
      orderBy: { createdAt: "desc" },
    });
    logger.info(`Fetched all verification requests count=${verificationRequests.length}`);
    return verificationRequests;
  } catch (error) {
    logger.error(`Error fetching verification requests ${error}`);
    throw error;
  }
};

export const findVerificationRequest = async (
  unique: FindVerificationRequestUnique,
): Promise<VerificationRequest | null> => {
  try {
    const verificationRequest = await prismaClient.verificationRequest.findUnique({
      where: unique,
    });
    logger.info(
      `Verification request lookup requestId=${unique.id} found=${!!verificationRequest}`,
    );
    return verificationRequest;
  } catch (error) {
    logger.error(`Error finding verification request ${error} requestId=${unique.id}`);
    throw error;
  }
};

export const updateVerificationRequest = async (
  where: Prisma.VerificationRequestWhereUniqueInput,
  data: UpdateVerificationRequestData,
): Promise<VerificationRequest> => {
  try {
    const updated = await prismaClient.verificationRequest.update({
      where,
      data,
    });
    logger.info(`Verification request updated successfully requestId=${updated.id}`);
    return updated;
  } catch (error) {
    logger.error(`Error updating verification request ${error}`);
    throw new Error("Failed to update verification request");
  }
};

export const deleteVerificationRequest = async (
  where: Prisma.VerificationRequestWhereUniqueInput,
): Promise<VerificationRequest> => {
  try {
    const deleted = await prismaClient.verificationRequest.delete({ where });
    logger.info(`Verification request deleted successfully requestId=${deleted.id}`);
    return deleted;
  } catch (error) {
    logger.error(`Error deleting verification request ${error}`);
    throw new Error("Failed to delete verification request");
  }
};

export type VerificationRequestTracking = Prisma.VerificationRequestGetPayload<{
  select: {
    id: true;
    details: true;
    createdAt: true;
    notifyOnInspectionStart: true;
    notifyOnReportReady: true;
    verificationType: {
      select: {
        name: true;
      };
    };
    agentAssignment: {
      select: {
        status: true;
        createdAt: true;
        scheduledAt: true;
        completedAt: true;
        progressPercent: true;
        checklistItems: {
          select: {
            status: true;
            media: {
              select: {
                url: true;
                fileName: true;
              };
            };
          };
        };
        agent: {
          select: {
            name: true;
            user: {
              select: {
                profilePhoto: true;
              };
            };
          };
        };
      };
    };
    report: {
      select: {
        generatedAt: true;
      };
    };
  };
}>;

export const getVerificationRequestTrackingForUser = async (
  id: string,
  userId: string,
): Promise<VerificationRequestTracking | null> => {
  try {
    const tracking = await prismaClient.verificationRequest.findFirst({
      where: { id, userId },
      select: {
        id: true,
        details: true,
        createdAt: true,
        notifyOnInspectionStart: true,
        notifyOnReportReady: true,
        verificationType: {
          select: {
            name: true,
          },
        },
        agentAssignment: {
          select: {
            status: true,
            createdAt: true,
            scheduledAt: true,
            completedAt: true,
            progressPercent: true,
            checklistItems: {
              select: {
                status: true,
                media: {
                  select: {
                    url: true,
                    fileName: true,
                  },
                },
              },
            },
            agent: {
              select: {
                name: true,
                user: {
                  select: {
                    profilePhoto: true,
                  },
                },
              },
            },
          },
        },
        report: {
          select: {
            generatedAt: true,
          },
        },
      },
    });
    logger.info(
      `Verification request tracking lookup requestId=${id} userId=${userId} found=${!!tracking}`,
    );
    return tracking;
  } catch (error) {
    logger.error(`Error finding verification request tracking ${error}`);
    throw error;
  }
};

export type VerificationRequestReportSummary = Prisma.VerificationRequestGetPayload<{
  select: {
    details: true;
    report: {
      select: {
        generatedAt: true;
        findings: true;
      };
    };
    agentAssignment: {
      select: {
        agent: {
          select: {
            name: true;
          };
        };
        checklistItems: {
          select: {
            media: {
              select: {
                url: true;
              };
              take: 3;
            };
          };
        };
      };
    };
    verificationPlan: {
      select: {
        name: true;
      };
    };
  };
}>;

export const getVerificationRequestReportSummaryForUser = async (
  id: string,
  userId: string,
): Promise<VerificationRequestReportSummary | null> => {
  try {
    const summary = await prismaClient.verificationRequest.findFirst({
      where: {
        id,
        userId,
      },
      select: {
        details: true,
        report: {
          select: {
            generatedAt: true,
            findings: true,
          },
        },
        agentAssignment: {
          select: {
            agent: {
              select: {
                name: true,
              },
            },
            checklistItems: {
              select: {
                media: {
                  select: {
                    url: true,
                  },
                  take: 3,
                },
              },
            },
          },
        },
        verificationPlan: {
          select: {
            name: true,
          },
        },
      },
    });
    return summary;
  } catch (error) {
    logger.error(`Error getting verification request report summary ${error}`);
    throw error;
  }
};

export type VerificationRequestFullReport = Prisma.VerificationRequestGetPayload<{
  select: {
    id: true;
    details: true;
    report: {
      select: {
        id: true;
        generatedAt: true;
        reviewStatus: true;
        summary: true;
        findings: true;
      };
    };
    agentAssignment: {
      select: {
        additionalNotes: true;
        agent: {
          select: {
            name: true;
          };
        };
        checklistItems: {
          select: {
            label: true;
            media: {
              select: {
                url: true;
              };
            };
          };
        };
      };
    };
  };
}>;

export const getVerificationRequestFullReportData = async (
  id: string,
): Promise<VerificationRequestFullReport | null> => {
  try {
    const fullReport = await prismaClient.verificationRequest.findFirst({
      where: {
        id,
      },
      select: {
        id: true,
        details: true,
        report: {
          select: {
            id: true,
            generatedAt: true,
            reviewStatus: true,
            summary: true,
            findings: true,
          },
        },
        agentAssignment: {
          select: {
            additionalNotes: true,
            agent: {
              select: {
                name: true,
              },
            },
            checklistItems: {
              select: {
                label: true,
                media: {
                  select: {
                    url: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return fullReport;
  } catch (error) {
    logger.error(`Error getting verification request full report ${error}`);
    throw error;
  }
};
