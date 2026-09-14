// reset-password-integration.test.ts
// Runs against a REAL TEST DATABASE.
// Exercises the full forgot-password → reset-password flow end-to-end.

import request from "supertest";
import bcrypt from "bcryptjs";
import app from "../../../../../app";
import { createClient, deleteClient } from "../../../../../api/client/authentication/services/database/client";
import { prismaClient } from "../../../../../utils/prisma";

const TEST_EMAIL = "integration-resetpw@example.com";
const ORIGINAL_PASSWORD = "OriginalPass123";
const NEW_PASSWORD = "BrandNewPass456";
let testUserId: string;

describe("POST /api/v1/client/reset-password/:token (integration, real DB)", () => {
  beforeAll(async () => {
    const hashed = await bcrypt.hash(ORIGINAL_PASSWORD, 10);
    const user = await createClient({
      email: TEST_EMAIL,
      password: hashed,
      fullName: "Reset PW Test User",
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await deleteClient({ id: testUserId });
    await prismaClient.$disconnect();
  });

  it("returns 400 when token is missing or password is missing", async () => {
    // Empty password
    const res = await request(app)
      .post("/api/v1/client/reset-password/sometoken")
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid/expired token", async () => {
    const res = await request(app)
      .post("/api/v1/client/reset-password/totally-invalid-token")
      .send({ password: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid|expired/i);
  });

  it("full flow: forgot-password then reset-password, then login with new password", async () => {
    // Step 1: Request forgot-password to get a reset token
    const forgotRes = await request(app)
      .post("/api/v1/client/forgot-password")
      .send({ email: TEST_EMAIL });

    expect(forgotRes.status).toBe(200);
    const resetToken = forgotRes.body.token;
    expect(resetToken).toBeDefined();

    // Step 2: Use the token to reset password
    const resetRes = await request(app)
      .post(`/api/v1/client/reset-password/${resetToken}`)
      .send({ password: NEW_PASSWORD });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.message).toMatch(/reset/i);

    // Step 3: Verify login with new password works
    const loginRes = await request(app)
      .post("/api/v1/client/login")
      .send({ email: TEST_EMAIL, password: NEW_PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();

    // Step 4: Verify old password no longer works
    const oldLoginRes = await request(app)
      .post("/api/v1/client/login")
      .send({ email: TEST_EMAIL, password: ORIGINAL_PASSWORD });

    expect(oldLoginRes.status).toBe(401);
  });

  it("returns 400 when a used token is reused", async () => {
    // Request a fresh reset token
    const forgotRes = await request(app)
      .post("/api/v1/client/forgot-password")
      .send({ email: TEST_EMAIL });

    const resetToken = forgotRes.body.token;

    // Use it once
    await request(app)
      .post(`/api/v1/client/reset-password/${resetToken}`)
      .send({ password: "AnotherPass789" });

    // Try to reuse
    const reuseRes = await request(app)
      .post(`/api/v1/client/reset-password/${resetToken}`)
      .send({ password: "HackerPass000" });

    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.message).toMatch(/invalid|expired/i);
  });
});
