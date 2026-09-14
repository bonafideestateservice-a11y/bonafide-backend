import request from "supertest";
import app from "../../../../../app";
import { findClient, deleteClient } from "../../../../../api/client/authentication/services/database/client";
import { prismaClient } from "../../../../../utils/prisma";

const TEST_EMAIL = "integration-signup-user@example.com";
const TEST_PASSWORD = "correctpass123";
let testUserId: string;

describe("POST /api/v1/auth/sign-up (integration, real DB)", () => {
  beforeAll(async () => {
    // Ensure cleanup just in case a previous test failed
    const existing = await findClient({ email: TEST_EMAIL });
    if (existing) {
      await deleteClient({ id: existing.id });
    }
  });

  afterAll(async () => {
    // Clean up
    if (testUserId) {
      await deleteClient({ id: testUserId });
    }
    await prismaClient.$disconnect();
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/v1/client/sign-up")
      .send({ password: TEST_PASSWORD, fullName: "Test User" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it("returns 201 and creates a user successfully", async () => {
    const res = await request(app)
      .post("/api/v1/client/sign-up")
      .send({ 
        email: TEST_EMAIL, 
        password: TEST_PASSWORD, 
        fullName: "Integration Test User",
        termsAndCondition: true 
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(TEST_EMAIL);
    expect(res.body.user.password).toBeUndefined();
    testUserId = res.body.user.id;
  });

  it("returns 409 when the email already exists", async () => {
    const res = await request(app)
      .post("/api/v1/client/sign-up")
      .send({ 
        email: TEST_EMAIL, 
        password: TEST_PASSWORD, 
        fullName: "Integration Test User 2" 
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/exists/i);
  });
});
