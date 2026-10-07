import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("suspend");
let token: string;
let clientId: string;

beforeAll(async () => {
  token = (await fx.createUser("ADMIN", "admin")).token;
  clientId = (await fx.createUser("CLIENT", "client")).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const setStatus = (id: string, status: string) =>
  request(app)
    .patch(`/api/v1/admin/agents/${id}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status });

const openJobs = (agentId: string) =>
  prismaClient.agentAssignment.count({
    where: { agentId, status: { in: ["ASSIGNED", "ACCEPTED", "INSPECTION_SCHEDULED"] } },
  });

describe("PATCH /api/v1/admin/agents/:id/status", () => {
  it("suspends an agent and moves or unassigns every open job", async () => {
    const leaving = await fx.createAgent("leaving");
    const roomForOne = await fx.createAgent("room");
    await fx.giveOpenJobs(roomForOne.id, clientId, 4);
    await fx.giveOpenJobs(leaving.id, clientId, 2);

    const response = await setStatus(leaving.id, "INACTIVE");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: leaving.id, status: "INACTIVE" });
    // Other agents in the database may also have room, so only the totals are fixed.
    expect(response.body.reassigned + response.body.unassigned).toBe(2);
    expect(await openJobs(leaving.id)).toBe(0);
    expect(await openJobs(roomForOne.id)).toBeLessThanOrEqual(5);
    const agent = await prismaClient.verificationAgent.findUniqueOrThrow({
      where: { id: leaving.id },
    });
    expect(agent.deactivatedAt).not.toBeNull();
  });

  it("reactivates an agent", async () => {
    const agent = await fx.createAgent("returning", "INACTIVE");
    const response = await setStatus(agent.id, "ACTIVE");
    expect(response.body).toMatchObject({ status: "ACTIVE", reassigned: 0 });
    const saved = await prismaClient.verificationAgent.findUniqueOrThrow({
      where: { id: agent.id },
    });
    expect(saved.deactivatedAt).toBeNull();
  });

  it("validates the status and the agent", async () => {
    expect((await setStatus("missing", "ACTIVE")).status).toBe(404);
    expect((await setStatus("missing", "SUSPENDED")).status).toBe(400);
  });
});
