import {
  AgentStatus,
  Prisma,
  PropertyRequestStatus,
  PropertyRequestType,
  ROLE,
  VerificationStatus,
} from "@prisma/client";
import {
  createPropertyRequest,
  findPropertyRequest,
  setPropertyRequestStatus,
} from "../../api/services/database/property-request";
import { generateToken } from "../../utils/jwt";
import { prismaClient } from "../../utils/prisma";

/**
 * Creates test records with unique names and deletes everything it created in `cleanup()`.
 * For integration tests that need users, agents and paid verification requests.
 */
export const createFixtures = (prefix: string) => {
  const tag = `${prefix}-${Date.now()}`;
  const userIds: string[] = [];
  const agentIds: string[] = [];
  const requestIds: string[] = [];
  const propertyIds: string[] = [];
  let typeId: string | undefined;
  let serviceId: string | undefined;

  const createUser = async (role: ROLE, label: string) => {
    const user = await prismaClient.user.create({
      data: {
        fullName: `${label} ${tag}`,
        email: `${label}-${tag}@example.com`,
        password: "hash",
        role,
      },
    });
    userIds.push(user.id);
    return { ...user, token: generateToken({ id: user.id }) };
  };

  const createAgent = async (label: string, status: AgentStatus = AgentStatus.ACTIVE) => {
    const user = await createUser(ROLE.AGENT, label);
    const agent = await prismaClient.verificationAgent.create({
      data: { userId: user.id, name: user.fullName, region: "Lagos", status },
    });
    agentIds.push(agent.id);
    return { ...agent, user };
  };

  const verificationTypeId = async () => {
    if (typeId) return typeId;
    serviceId = (await prismaClient.service.create({ data: { name: tag, slug: tag } })).id;
    typeId = (
      await prismaClient.verificationType.create({
        data: { serviceId, name: "Land Verification", slug: `${tag}-type` },
      })
    ).id;
    return typeId;
  };

  /** A request with one successful payment (a paid period waiting for an agent). */
  const createPaidRequest = async (
    userId: string,
    status: VerificationStatus = VerificationStatus.SUBMITTED,
  ) => {
    const request = await prismaClient.verificationRequest.create({
      data: { userId, verificationTypeId: await verificationTypeId(), status, details: {} },
    });
    requestIds.push(request.id);
    const payment = await prismaClient.transaction.create({
      data: {
        verificationRequestId: request.id,
        amountInCents: 500000,
        method: "CARD",
        status: "SUCCESS",
        paidAt: new Date(),
      },
    });
    return { ...request, paymentId: payment.id };
  };

  /** Gives an agent `count` open (ASSIGNED) jobs on new paid requests. */
  const giveOpenJobs = async (agentId: string, clientId: string, count: number) => {
    for (let i = 0; i < count; i += 1) {
      const request = await createPaidRequest(clientId, VerificationStatus.IN_PROGRESS);
      await prismaClient.agentAssignment.create({
        data: { verificationRequestId: request.id, agentId, transactionId: request.paymentId },
      });
    }
  };

  const trackProperty = (id: string) => propertyIds.push(id);

  /** A published property; pass fields to override. */
  const createProperty = async (data: Partial<Prisma.PropertyCreateInput> = {}) => {
    const property = await prismaClient.property.create({
      data: { name: `Property ${tag}`, address: "Lekki, Lagos", isPublished: true, ...data },
    });
    propertyIds.push(property.id);
    return property;
  };

  /**
   * A client's purchase (or consultation) of a new ₦85m property, moved to `status`. A purchase
   * at IN_PROGRESS has its payment. Deleted with the property in cleanup().
   */
  const createPurchase = async (
    userId: string,
    status: PropertyRequestStatus = PropertyRequestStatus.IN_PROGRESS,
    type: PropertyRequestType = PropertyRequestType.PURCHASE,
  ) => {
    const property = await createProperty({ priceAmount: BigInt(85000000) });
    const created = await createPropertyRequest(userId, property.id, type);
    if (!created) throw new Error("property not published");
    if (status !== PropertyRequestStatus.SUBMITTED) {
      await setPropertyRequestStatus(created.request.id, status, null);
    }
    return (await findPropertyRequest({ id: created.request.id }))!;
  };

  const cleanup = async () => {
    const byRequest = { verificationRequestId: { in: requestIds } };
    await prismaClient.activityLog.deleteMany({ where: byRequest });
    await prismaClient.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prismaClient.verificationChecklistItem.deleteMany({
      where: { agentAssignment: byRequest },
    });
    await prismaClient.verificationReport.deleteMany({ where: byRequest });
    await prismaClient.agentAssignment.deleteMany({ where: byRequest });
    await prismaClient.transaction.deleteMany({ where: byRequest });
    await prismaClient.verificationRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prismaClient.property.deleteMany({ where: { id: { in: propertyIds } } });
    await prismaClient.verificationAgent.deleteMany({ where: { id: { in: agentIds } } });
    if (typeId) await prismaClient.verificationType.delete({ where: { id: typeId } });
    if (serviceId) await prismaClient.service.delete({ where: { id: serviceId } });
    await prismaClient.user.deleteMany({ where: { id: { in: userIds } } });
  };

  return {
    tag,
    createUser,
    createAgent,
    createPaidRequest,
    giveOpenJobs,
    trackProperty,
    createProperty,
    createPurchase,
    cleanup,
  };
};
