import request from "supertest";
import app from "../../../../../app";
import { appEvents, AppEventTypes } from "../../../../../events";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("activity");
let token: string;
let requestId: string;
let agent: Awaited<ReturnType<typeof fx.createAgent>>;
let clientName: string;

beforeAll(async () => {
  token = (await fx.createUser("ADMIN", "admin")).token;
  const client = await fx.createUser("CLIENT", "client");
  clientName = client.fullName;
  agent = await fx.createAgent("agent");
  requestId = (await fx.createPaidRequest(client.id)).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

describe("GET /api/v1/admin/dashboard/activities", () => {
  it("records events and returns them newest first with the right name", async () => {
    appEvents.emit(AppEventTypes.VERIFICATION_REQUEST_CREATED, {
      verificationRequestId: requestId,
      userId: (
        await prismaClient.verificationRequest.findUniqueOrThrow({ where: { id: requestId } })
      ).userId,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    appEvents.emit(AppEventTypes.AGENT_ASSIGNED, {
      assignmentId: "a1",
      verificationRequestId: requestId,
      agentId: agent.id,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const response = await request(app)
      .get("/api/v1/admin/dashboard/activities?limit=100")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const mine = response.body.data.filter(
      (a: { verificationRequestId: string }) => a.verificationRequestId === requestId,
    );
    expect(mine.map((a: { type: string; subjectName: string }) => [a.type, a.subjectName])).toEqual(
      [
        ["AGENT_ASSIGNED", agent.name],
        ["VERIFICATION_REQUEST_CREATED", clientName],
      ],
    );
    expect(response.body.meta).toMatchObject({ page: 1, limit: 100 });
  });

  it("rejects invalid paging", async () => {
    const response = await request(app)
      .get("/api/v1/admin/dashboard/activities?page=0")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(400);
  });
});
