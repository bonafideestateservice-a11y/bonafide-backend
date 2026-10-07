import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("unassign");
let token: string;
let clientId: string;
let agentId: string;

beforeAll(async () => {
  token = (await fx.createUser("ADMIN", "admin")).token;
  clientId = (await fx.createUser("CLIENT", "client")).id;
  agentId = (await fx.createAgent("agent")).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const unassign = (id: string) =>
  request(app)
    .delete(`/api/v1/admin/verification-requests/${id}/assign-agent`)
    .set("Authorization", `Bearer ${token}`);

const assignedRequest = async (status: "ASSIGNED" | "REPORT_SUBMITTED") => {
  const paid = await fx.createPaidRequest(clientId, "IN_PROGRESS");
  await prismaClient.agentAssignment.create({
    data: { verificationRequestId: paid.id, agentId, transactionId: paid.paymentId, status },
  });
  await prismaClient.transaction.update({
    where: { id: paid.paymentId },
    data: { assignedAt: new Date() },
  });
  return paid;
};

describe("DELETE /api/v1/admin/verification-requests/:id/assign-agent", () => {
  it("removes the agent and puts the paid period back to waiting", async () => {
    const paid = await assignedRequest("ASSIGNED");

    const response = await unassign(paid.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ verificationRequestId: paid.id, status: "PENDING" });
    expect(
      await prismaClient.agentAssignment.findUnique({ where: { verificationRequestId: paid.id } }),
    ).toBeNull();
    expect(
      (await prismaClient.verificationRequest.findUniqueOrThrow({ where: { id: paid.id } })).status,
    ).toBe("SUBMITTED");
    expect(
      (await prismaClient.transaction.findUniqueOrThrow({ where: { id: paid.paymentId } }))
        .assignedAt,
    ).toBeNull();
  });

  it("returns 404 when no agent is assigned", async () => {
    const paid = await fx.createPaidRequest(clientId);
    expect((await unassign(paid.id)).status).toBe(404);
  });

  it("returns 409 once the report is submitted", async () => {
    const paid = await assignedRequest("REPORT_SUBMITTED");
    expect((await unassign(paid.id)).status).toBe(409);
  });
});
