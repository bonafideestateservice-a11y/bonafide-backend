// forgot-password-integration.test.ts
// Runs against a REAL TEST DATABASE.

import request from "supertest";
import bcrypt from "bcryptjs";
import { ROLE } from "@prisma/client";
import app from "../../../../../app";
import { createAdmin, deleteAdmin } from "../../../../../api/admin/authentication/services/database/admin";
import { prismaClient } from "../../../../../utils/prisma";

const TEST_EMAIL = "integration-forgotpw@example.com";
const TEST_PASSWORD = "CorrectPass123";
let testUserId: string;

describe("POST /api/v1/admin/forgot-password (integration, real DB)", () => {
  beforeAll(async () => {
    const hashed = await bcrypt.hash(TEST_PASSWORD, 10);
    const user = await createAdmin({ role: ROLE.ADMIN,
      email: TEST_EMAIL,
      password: hashed,
      fullName: "Forgot PW Test User",
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up reset tokens for this user first (cascade might handle it)
    await deleteAdmin({ id: testUserId });
    await prismaClient.$disconnect();
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/v1/admin/forgot-password")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it("returns 404 when email does not exist", async () => {
    const res = await request(app)
      .post("/api/v1/admin/forgot-password")
      .send({ email: "nonexistent@example.com" });

    expect(res.status).toBe(404);
  });

  it("returns 200 with an OTP for a valid user", async () => {
    const res = await request(app)
      .post("/api/v1/admin/forgot-password")
      .send({ email: TEST_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.otp).toBeDefined();
    expect(typeof res.body.otp).toBe("string");
  });
});
