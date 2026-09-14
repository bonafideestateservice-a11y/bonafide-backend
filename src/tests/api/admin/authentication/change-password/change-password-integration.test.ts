// change-password-integration.test.ts
// Runs against a REAL TEST DATABASE.

import request from "supertest";
import bcrypt from "bcryptjs";
import { ROLE } from "@prisma/client";
import app from "../../../../../app";
import { createAdmin, deleteAdmin } from "../../../../../api/admin/authentication/services/database/admin";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const TEST_EMAIL = "integration-changepw@example.com";
const TEST_PASSWORD = "CorrectPass123";
let testUserId: string;
let authToken: string;

describe("POST /api/v1/admin/change-password (integration, real DB)", () => {
  beforeAll(async () => {
    const hashed = await bcrypt.hash(TEST_PASSWORD, 10);
    const user = await createAdmin({ role: ROLE.ADMIN,
      email: TEST_EMAIL,
      password: hashed,
      fullName: "Change PW Test User",
    });
    testUserId = user.id;
    authToken = generateToken({ id: user.id });
  });

  afterAll(async () => {
    await deleteAdmin({ id: testUserId });
    await prismaClient.$disconnect();
  });

  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app)
      .post("/api/v1/admin/change-password")
      .send({
        currentPassword: TEST_PASSWORD,
        newPassword: "NewPass1234",
        confirmPassword: "NewPass1234",
      });

    expect(res.status).toBe(401);
  });

  it("returns 400 when password fields are missing", async () => {
    const res = await request(app)
      .post("/api/v1/admin/change-password")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ currentPassword: TEST_PASSWORD });

    expect(res.status).toBe(400);
  });

  it("returns 401 when current password is wrong", async () => {
    const res = await request(app)
      .post("/api/v1/admin/change-password")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        currentPassword: "WrongPassword",
        newPassword: "NewPass1234",
        confirmPassword: "NewPass1234",
      });

    expect(res.status).toBe(401);
  });

  it("returns 200 and changes password on success", async () => {
    const res = await request(app)
      .post("/api/v1/admin/change-password")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        currentPassword: TEST_PASSWORD,
        newPassword: "NewPass1234",
        confirmPassword: "NewPass1234",
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/changed/i);

    // Verify new password works by logging in
    const loginRes = await request(app)
      .post("/api/v1/admin/login")
      .send({ email: TEST_EMAIL, password: "NewPass1234" });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
  });
});
