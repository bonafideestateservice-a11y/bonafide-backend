import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("add-agent");
const email = `new-agent-${fx.tag}@example.com`;
const password = "Temp@1234";
let adminToken: string;
let clientToken: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
  clientToken = (await fx.createUser("CLIENT", "client")).token;
});
afterAll(async () => {
  await prismaClient.verificationAgent.deleteMany({ where: { user: { email } } });
  await prismaClient.user.deleteMany({ where: { email } });
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const addAgent = (data: Record<string, unknown>, token = adminToken) =>
  request(app).post("/api/v1/admin/agents").set("Authorization", `Bearer ${token}`).send(data);

describe("POST /api/v1/admin/agents", () => {
  it("creates an agent who must change the admin-set password", async () => {
    const response = await addAgent({
      fullName: "Tunde Bello",
      email: email.toUpperCase(),
      password,
      phone: "+2348012345678",
      region: "Lagos",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Tunde Bello",
      email,
      phone: "+2348012345678",
      region: "Lagos",
      status: "ACTIVE",
      mustChangePassword: true,
    });
    expect(response.body).not.toHaveProperty("password");

    const user = await prismaClient.user.findUniqueOrThrow({
      where: { email },
      include: { verificationAgent: true },
    });
    expect(user.role).toBe("AGENT");
    expect(user.password).not.toBe(password);
    expect(user.verificationAgent?.id).toBe(response.body.id);

    // The agent appears in the agents list.
    const list = await request(app)
      .get("/api/v1/admin/agents")
      .query({ search: email })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.data.map((agent: { id: string }) => agent.id)).toContain(response.body.id);
  });

  it("lets the agent log in, then clears the flag once the password is changed", async () => {
    const login = await request(app).post("/api/v1/admin/login").send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ role: "AGENT", mustChangePassword: true });

    const change = await request(app)
      .post("/api/v1/admin/change-password")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        currentPassword: password,
        newPassword: "Agent@5678",
        confirmPassword: "Agent@5678",
      });
    expect(change.status).toBe(200);

    const again = await request(app)
      .post("/api/v1/admin/login")
      .send({ email, password: "Agent@5678" });
    expect(again.body.user.mustChangePassword).toBe(false);
  });

  it("rejects a duplicate email", async () => {
    const response = await addAgent({ fullName: "Copy", email, password });
    expect(response.status).toBe(409);
  });

  it("validates the body", async () => {
    const response = await addAgent({ fullName: "No Password", email: `x-${email}` });
    expect(response.status).toBe(400);
  });

  it("is admin only", async () => {
    expect((await addAgent({}, clientToken)).status).toBe(403);
    expect((await request(app).post("/api/v1/admin/agents").send({})).status).toBe(401);
  });
});
