import { NotificationType } from "@prisma/client";
import { AppEventPayloads, AppEventTypes, PayloadEventType } from "../../../events";
import { prismaClient } from "../../../utils/prisma";

const agentName = async (id: string) =>
  (await prismaClient.verificationAgent.findUnique({ where: { id }, select: { name: true } }))
    ?.name;

/** The request, agent and amount an event shows in the admin "Recent activity" feed. */
const describe = async <K extends PayloadEventType>(type: K, payload: AppEventPayloads[K]) => {
  const p = payload as AppEventPayloads[PayloadEventType] & Record<string, string>;
  switch (type) {
    case AppEventTypes.VERIFICATION_REQUEST_CREATED:
      return { verificationRequestId: p.verificationRequestId };
    case AppEventTypes.PAYMENT_RECEIVED:
      return { verificationRequestId: p.booking_ref, amount: Number(p.amount) };
    case AppEventTypes.AGENT_ASSIGNED:
    case AppEventTypes.INSPECTION_STARTED:
      return {
        verificationRequestId: p.verificationRequestId,
        agentName: await agentName(p.agentId),
      };
    case AppEventTypes.REPORT_UPLOADED:
      return {
        verificationRequestId: p.verificationRequestId,
        agentName: await agentName(p.submittedByAgentId),
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
  if (!activity?.verificationRequestId) return;
  const request = await prismaClient.verificationRequest.findUnique({
    where: { id: activity.verificationRequestId },
    select: { user: { select: { fullName: true } } },
  });
  const clientName = request?.user.fullName;
  // subjectName keeps its old meaning (the agent on agent events, otherwise the client).
  const subjectName = activity.agentName ?? clientName;
  if (!subjectName) return;
  await prismaClient.activityLog.create({
    data: {
      type: type as NotificationType,
      verificationRequestId: activity.verificationRequestId,
      subjectName,
      clientName,
      agentName: activity.agentName,
      amount: activity.amount,
    },
  });
};

/** "Property Added" in the feed: `addedBy` is the admin's name. */
export const recordPropertyAdded = (property: { id: string; name: string }, addedBy: string) =>
  prismaClient.activityLog.create({
    data: {
      type: NotificationType.PROPERTY_ADDED,
      propertyId: property.id,
      subjectName: property.name,
      clientName: addedBy,
    },
  });
