import request from "supertest";
import bcrypt from "bcryptjs";
import app from "../../../../../app";
import {
  createClient,
  deleteClient,
} from "../../../../../api/client/authentication/services/database/client";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
const initialEmail = `client-profile-${suffix}@example.com`;
const updatedEmail = `client-profile-updated-${suffix}@example.com`;
const password = "CorrectPass123";
let userId: string;
let token: string;

describe("Client profile endpoints (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: initialEmail,
      password: await bcrypt.hash(password, 10),
      fullName: "Client Profile User",
    });
    userId = user.id;
    token = generateToken({ id: user.id });
  });

  afterAll(async () => {
    await deleteClient({ id: userId });
    await prismaClient.$disconnect();
  });

  it("gets the authenticated client profile", async () => {
    const response = await request(app)
      .get("/api/v1/client/profile")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: userId,
        fullName: "Client Profile User",
        email: initialEmail,
        phone: null,
        location: null,
        countryCode: null,
        profilePhoto: null,
        role: "CLIENT",
      }),
    );
  });

  it("updates the client profile", async () => {
    const response = await request(app)
      .patch("/api/v1/client/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fullName: "Updated Client",
        phone: "+2347000000000",
        location: "Lagos",
        countryCode: " ng ",
      });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        fullName: "Updated Client",
        phone: "+2347000000000",
        location: "Lagos",
        countryCode: "NG",
      }),
    );
  });

  it("clears the client country code when an empty value is sent", async () => {
    const response = await request(app)
      .patch("/api/v1/client/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ countryCode: "" });

    expect(response.status).toBe(200);
    expect(response.body.countryCode).toBeNull();
  });

  it("rejects an invalid country code", async () => {
    const response = await request(app)
      .patch("/api/v1/client/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ countryCode: "Nigeria" });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/country code/i);
  });

  it("changes the client email", async () => {
    const response = await request(app)
      .patch("/api/v1/client/profile/email")
      .set("Authorization", `Bearer ${token}`)
      .send({ newEmail: updatedEmail, password });
    expect(response.status).toBe(200);
    expect(response.body.email).toBe(updatedEmail);
    await expect(prismaClient.user.findUnique({ where: { id: userId } })).resolves.toEqual(
      expect.objectContaining({ email: updatedEmail }),
    );
  });
});
