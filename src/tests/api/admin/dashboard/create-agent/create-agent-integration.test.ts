import request from "supertest";
import app from "../../../../../app";
import { appEvents, AppEventTypes } from "../../../../../events";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("create-agent");
const email = `new-agent-${fx.tag}@example.com`;
let adminToken: string;
let clientToken: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
  clientToken = (await fx.createUser("CLIENT", "client")).token;
});
afterAll(async () => {
  const user = await prismaClient.user.findUnique({ where: { email } });
  if (user) {
    await prismaClient.verificationAgent.deleteMany({ where: { userId: user.id } });
    await prismaClient.user.delete({ where: { id: user.id } });
  }
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const createAgent = (body: object, token = adminToken) =>
  request(app).post("/api/v1/admin/agents").set("Authorization", `Bearer ${token}`).send(body);

describe("POST /api/v1/admin/agents", () => {
  it("creates an agent who sets a password with the emailed code and logs in", async () => {
    const emit = jest.spyOn(appEvents, "emit");

    const response = await createAgent({
      fullName: "John Anderson",
      email: email.toUpperCase(),
      region: "Lagos",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "John Anderson",
      email,
      region: "Lagos",
      phone: null,
      status: "ACTIVE",
    });
    expect(response.body).not.toHaveProperty("setupCode");
    const user = await prismaClient.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ role: "AGENT", password: null });

    const [, payload] = emit.mock.calls.find(([type]) => type === AppEventTypes.AGENT_CREATED)!;
    const { setupCode, expiresIn } = payload as { setupCode: string; expiresIn: string };
    expect(setupCode).toMatch(/^\d{6}$/);
    expect(expiresIn).toBe("48 hours");
    emit.mockRestore();

    const reset = await request(app)
      .post("/api/v1/admin/reset-password")
      .send({ email, otp: setupCode, password: "Agent!2345" });
    expect(reset.status).toBe(200);

    const login = await request(app)
      .post("/api/v1/admin/login")
      .send({ email, password: "Agent!2345" });
    expect(login.status).toBe(200);
  });

  it("returns 409 for an email already in use", async () => {
    const response = await createAgent({ fullName: "Someone Else", email });
    expect(response.status).toBe(409);
  });

  it("validates the body", async () => {
    expect((await createAgent({ email: "x@example.com" })).status).toBe(400);
    expect((await createAgent({ fullName: "X", email: "bad" })).status).toBe(400);
  });

  it("is admin only", async () => {
    const response = await createAgent({ fullName: "X", email: "x@example.com" }, clientToken);
    expect(response.status).toBe(403);
  });
});
