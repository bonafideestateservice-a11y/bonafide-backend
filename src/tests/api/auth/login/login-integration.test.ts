import request from "supertest";
import app from "../../../../app";
import { prismaClient } from "../../../../utils/prisma";
import { hashPassword } from "../../../../utils/password";
import { createFixtures } from "../../../helpers/fixtures";

const fx = createFixtures("unified-login");
const password = "Secret@123";
const emails: Record<string, string> = {};

beforeAll(async () => {
  const hash = await hashPassword(password);
  const client = await fx.createUser("CLIENT", "client");
  const admin = await fx.createUser("ADMIN", "admin");
  const agent = await fx.createAgent("agent");
  const suspended = await fx.createUser("CLIENT", "suspended");
  const social = await fx.createUser("CLIENT", "social");
  await prismaClient.user.updateMany({
    where: { id: { in: [client.id, admin.id, agent.userId, suspended.id] } },
    data: { password: hash },
  });
  await prismaClient.user.update({ where: { id: suspended.id }, data: { status: "SUSPENDED" } });
  await prismaClient.user.update({ where: { id: social.id }, data: { password: null } });
  Object.assign(emails, {
    CLIENT: client.email,
    ADMIN: admin.email,
    AGENT: agent.user.email,
    suspended: suspended.email,
    social: social.email,
  });
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const login = (body: object) => request(app).post("/api/v1/auth/login").send(body);

describe("POST /api/v1/auth/login", () => {
  it.each(["CLIENT", "ADMIN", "AGENT"])("logs in a %s and returns the role", async (role) => {
    const response = await login({ email: emails[role].toUpperCase(), password });
    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ email: emails[role], role });
    expect(response.body.user).not.toHaveProperty("password");
  });

  it("returns a token the role's endpoints accept", async () => {
    const { body } = await login({ email: emails.ADMIN, password });
    const profile = await request(app)
      .get("/api/v1/admin/profile")
      .set("Authorization", `Bearer ${body.token}`);
    expect(profile.status).toBe(200);
  });

  it("rejects wrong passwords and unknown emails with the same 401", async () => {
    const wrong = await login({ email: emails.CLIENT, password: "nope-nope" });
    const unknown = await login({ email: `nobody-${fx.tag}@example.com`, password });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it("rejects social-only and suspended accounts", async () => {
    expect((await login({ email: emails.social, password })).status).toBe(401);
    expect((await login({ email: emails.suspended, password })).status).toBe(403);
  });

  it("validates the body", async () => {
    expect((await login({ email: emails.CLIENT })).status).toBe(400);
  });
});
