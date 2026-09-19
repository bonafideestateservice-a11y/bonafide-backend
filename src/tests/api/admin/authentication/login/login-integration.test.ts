// login.integration.test.ts
// Run against a REAL TEST DATABASE — never your dev or prod DB.
//
// Setup required before this will work:
//   1. A separate test database (e.g. `myapp_test`), never shared
//      with dev/prod.
//   2. A .env.test (or similar) pointing your DB connection at it.
//      Load it however your project already loads env config, e.g.:
//        DATABASE_URL=postgres://.../myapp_test jest --config=jest.integration.config.js
//   3. Migrations run against that test DB before the suite starts
//      (often done in a `globalSetup` script or a CI step).
//
// This example assumes your DB layer exposes a `createAdmin` and
// `deleteAdmin` alongside the existing `findAdmin` — adjust these
// imports/calls to whatever your actual database service module
// provides (raw SQL, Prisma, Mongoose, Knex, etc.).

import request from "supertest";
import bcrypt from "bcryptjs";
import { ROLE } from "@prisma/client";
import app from "../../../../../app"; // your Express app, NOT app.listen()
import {
  createAdmin,
  deleteAdmin,
} from "../../../../../api/admin/authentication/services/database/admin";
import { prismaClient } from "../../../../../utils/prisma";

const TEST_EMAIL = "integration-test-user@example.com";
const TEST_PASSWORD = "correctpass123";
let testUserId: string;

describe("POST /api/v1/admin/login (integration, real DB)", () => {
  beforeAll(async () => {
    // Seed one real row directly through your DB layer, hashing the
    // password the same way your app does at signup time.
    const hashed = await bcrypt.hash(TEST_PASSWORD, 10);
    const user = await createAdmin({
      role: ROLE.ADMIN,
      email: TEST_EMAIL,
      password: hashed,
      fullName: "Integration Test User",
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Always clean up what you inserted, even if a test fails above.
    await deleteAdmin({ id: testUserId });
    await prismaClient.$disconnect(); // avoids Jest hanging on an open DB handle
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app).post("/api/v1/admin/login").send({ password: TEST_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it("returns 404 when the user does not exist", async () => {
    const res = await request(app)
      .post("/api/v1/admin/login")
      .send({ email: "definitely-not-seeded@example.com", password: "whatever" });

    expect(res.status).toBe(404);
  });

  it("returns 401 for an incorrect password against the real seeded user", async () => {
    const res = await request(app)
      .post("/api/v1/admin/login")
      .send({ email: TEST_EMAIL, password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  it("returns 200, a real token, and no password field on success", async () => {
    const res = await request(app)
      .post("/api/v1/admin/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(TEST_EMAIL);
    expect(res.body.user.password).toBeUndefined();
  });

  it("responds within an acceptable time budget against the real DB + real bcrypt", async () => {
    const start = performance.now();

    await request(app)
      .post("/api/v1/admin/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    // Real DB round-trip + real bcrypt.compare, so give this more
    // headroom than the fully-mocked version would need.
    expect(performance.now() - start).toBeLessThan(500); // ms
  });
});
