// reset-password-integration.test.ts
// Runs against a REAL TEST DATABASE.
// Exercises the full forgot-password → verify-otp → reset-password flow end-to-end.

import request from "supertest";
import bcrypt from "bcryptjs";
import { ROLE } from "@prisma/client";
import app from "../../../../../app";
import { createAdmin, deleteAdmin } from "../../../../../api/admin/authentication/services/database/admin";
import { prismaClient } from "../../../../../utils/prisma";

const TEST_EMAIL = "integration-resetpw@example.com";
const ORIGINAL_PASSWORD = "OriginalPass123";
const NEW_PASSWORD = "BrandNewPass456";
let testUserId: string;

describe("POST /api/v1/admin/reset-password (integration, real DB)", () => {
  beforeAll(async () => {
    const hashed = await bcrypt.hash(ORIGINAL_PASSWORD, 10);
    const user = await createAdmin({ role: ROLE.ADMIN,
      email: TEST_EMAIL,
      password: hashed,
      fullName: "Reset PW Test User",
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await deleteAdmin({ id: testUserId });
    await prismaClient.$disconnect();
  });

  it("returns 400 when missing fields", async () => {
    // Empty request body
    const res = await request(app)
      .post("/api/v1/admin/reset-password")
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid/expired OTP", async () => {
    const res = await request(app)
      .post("/api/v1/admin/reset-password")
      .send({ email: TEST_EMAIL, otp: "000000", password: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid|expired/i);
  });

  it("full flow: forgot-password then verify-otp then reset-password, then login with new password", async () => {
    // Step 1: Request forgot-password to get a reset OTP
    const forgotRes = await request(app)
      .post("/api/v1/admin/forgot-password")
      .send({ email: TEST_EMAIL });

    expect(forgotRes.status).toBe(200);
    const otp = forgotRes.body.otp;
    expect(otp).toBeDefined();

    // Step 2: Verify the OTP
    const verifyRes = await request(app)
      .post(`/api/v1/admin/verify-otp`)
      .send({ otp });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.message).toMatch(/verified/i);

    // Step 3: Use the OTP to reset password
    const resetRes = await request(app)
      .post(`/api/v1/admin/reset-password`)
      .send({ email: TEST_EMAIL, otp, password: NEW_PASSWORD });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.message).toMatch(/reset/i);

    // Step 4: Verify login with new password works
    const loginRes = await request(app)
      .post("/api/v1/admin/login")
      .send({ email: TEST_EMAIL, password: NEW_PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();

    // Step 5: Verify old password no longer works
    const oldLoginRes = await request(app)
      .post("/api/v1/admin/login")
      .send({ email: TEST_EMAIL, password: ORIGINAL_PASSWORD });

    expect(oldLoginRes.status).toBe(401);
  });

  it("returns 400 when a used OTP is reused", async () => {
    // Request a fresh reset OTP
    const forgotRes = await request(app)
      .post("/api/v1/admin/forgot-password")
      .send({ email: TEST_EMAIL });

    const otp = forgotRes.body.otp;

    // Use it once
    await request(app)
      .post(`/api/v1/admin/reset-password`)
      .send({ email: TEST_EMAIL, otp, password: "AnotherPass789" });

    // Try to reuse
    const reuseRes = await request(app)
      .post(`/api/v1/admin/reset-password`)
      .send({ email: TEST_EMAIL, otp, password: "HackerPass000" });

    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.message).toMatch(/invalid|expired/i);
  });
});
