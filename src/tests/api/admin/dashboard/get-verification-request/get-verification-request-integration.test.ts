import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("request-detail");
let token: string;
let requestId: string;
let paymentId: string;
let agentId: string;

beforeAll(async () => {
  token = (await fx.createUser("ADMIN", "admin")).token;
  const client = await fx.createUser("CLIENT", "client");
  const agent = await fx.createAgent("agent");
  agentId = agent.id;
  const paid = await fx.createPaidRequest(client.id, "IN_PROGRESS");
  requestId = paid.id;
  paymentId = paid.paymentId;
  await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId: requestId,
      agentId,
      transactionId: paymentId,
      status: "ACCEPTED",
    },
  });
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const get = (id: string) =>
  request(app)
    .get(`/api/v1/admin/verification-requests/${id}`)
    .set("Authorization", `Bearer ${token}`);

describe("GET /api/v1/admin/verification-requests/:id", () => {
  it("returns the client, agent and payments, never the password", async () => {
    const response = await get(requestId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: requestId,
      status: "IN_PROGRESS",
      verificationType: "Land Verification",
      agent: { id: agentId, assignmentStatus: "ACCEPTED" },
      payments: [expect.objectContaining({ id: paymentId, status: "SUCCESS" })],
      reports: [],
    });
    expect(JSON.stringify(response.body)).not.toContain("hash");
  });

  it("returns 404 for an unknown request", async () => {
    expect((await get("missing")).status).toBe(404);
  });
});
