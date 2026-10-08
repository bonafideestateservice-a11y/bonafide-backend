import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("report-comment");
let client: Awaited<ReturnType<typeof fx.createUser>>;
let requestId: string;
let reportId: string;

beforeAll(async () => {
  client = await fx.createUser("CLIENT", "client");
  const agent = await fx.createAgent("agent");
  const paid = await fx.createPaidRequest(client.id, "COMPLETED");
  requestId = paid.id;
  reportId = (
    await prismaClient.verificationReport.create({
      data: {
        verificationRequestId: requestId,
        transactionId: paid.paymentId,
        submittedByAgentId: agent.id,
        generatedAt: new Date(),
      },
    })
  ).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const comment = (id: string, body: object, token = client.token) =>
  request(app)
    .post(`/api/v1/client/verification-requests/${id}/report/comment`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);

describe("POST /api/v1/client/verification-requests/:id/report/comment", () => {
  it("saves the feedback, and sending it again overwrites it", async () => {
    const first = await comment(requestId, { rating: 3, comment: "Photos were dark" });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ reportId, rating: 3, comment: "Photos were dark" });

    const second = await comment(requestId, { rating: 5 });
    expect(second.body).toMatchObject({ reportId, rating: 5, comment: null });

    const report = await prismaClient.verificationReport.findUnique({ where: { id: reportId } });
    expect(report).toMatchObject({ rating: 5, clientComment: null });
    expect(report?.ratedAt).toBeInstanceOf(Date);
  });

  it("returns 400 for an invalid rating", async () => {
    expect((await comment(requestId, { rating: 9 })).status).toBe(400);
  });

  it("returns 403 for another client and 401 without a token", async () => {
    const other = await fx.createUser("CLIENT", "other");
    expect((await comment(requestId, { rating: 4 }, other.token)).status).toBe(403);
    const response = await request(app)
      .post(`/api/v1/client/verification-requests/${requestId}/report/comment`)
      .send({ rating: 4 });
    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown request or one with no report yet", async () => {
    const noReport = await fx.createPaidRequest(client.id);
    expect((await comment("missing", { rating: 4 })).status).toBe(404);
    expect((await comment(noReport.id, { rating: 4 })).status).toBe(404);
  });
});
