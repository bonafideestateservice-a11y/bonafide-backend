import { NotificationType } from "@prisma/client";
import { AppEventPayloads, AppEventTypes, PayloadEventType } from "../../../events";
import { prismaClient } from "../../../utils/prisma";

const agentName = async (id: string) =>
  (await prismaClient.verificationAgent.findUnique({ where: { id }, select: { name: true } }))
    ?.name;

/** The request and the name an event shows in the admin "Recent activity" feed. */
const describe = async <K extends PayloadEventType>(type: K, payload: AppEventPayloads[K]) => {
  const p = payload as AppEventPayloads[PayloadEventType] & Record<string, string>;
  switch (type) {
    case AppEventTypes.VERIFICATION_REQUEST_CREATED: {
      const user = await prismaClient.user.findUnique({
        where: { id: p.userId },
        select: { fullName: true },
      });
      return { verificationRequestId: p.verificationRequestId, subjectName: user?.fullName };
    }
    case AppEventTypes.PAYMENT_RECEIVED:
      return { verificationRequestId: p.booking_ref, subjectName: p.firstName };
    case AppEventTypes.AGENT_ASSIGNED:
    case AppEventTypes.INSPECTION_STARTED:
      return {
        verificationRequestId: p.verificationRequestId,
        subjectName: await agentName(p.agentId),
      };
    case AppEventTypes.REPORT_UPLOADED:
      return {
        verificationRequestId: p.verificationRequestId,
        subjectName: await agentName(p.submittedByAgentId),
      };
    default:
      return null; // sign-ups and password resets aren't shown in the feed
  }
};

export const recordActivity = async <K extends PayloadEventType>(
  type: K,
  payload: AppEventPayloads[K],
) => {
  const activity = await describe(type, payload);
  if (!activity?.subjectName) return;
  await prismaClient.activityLog.create({
    data: {
      type: type as NotificationType,
      verificationRequestId: activity.verificationRequestId,
      subjectName: activity.subjectName,
    },
  });
};
