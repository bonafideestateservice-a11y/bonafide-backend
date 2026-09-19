import request from "supertest";
import bcrypt from "bcryptjs";
import { ROLE } from "@prisma/client";
import app from "../../../../../app";
import {
  createAdmin,
  deleteAdmin,
} from "../../../../../api/admin/authentication/services/database/admin";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
const initialEmail = `profile-admin-${suffix}@example.com`;
const updatedEmail = `profile-updated-${suffix}@example.com`;
const password = "CorrectPass123";
let userId: string;
let token: string;

describe("Admin profile endpoints (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createAdmin({
      role: ROLE.ADMIN,
      email: initialEmail,
      password: await bcrypt.hash(password, 10),
      fullName: "David Miller",
    });
    userId = user.id;
    token = generateToken({ id: user.id });
  });

  afterAll(async () => {
    await deleteAdmin({ id: userId });
    await prismaClient.$disconnect();
  });

  it("gets the authenticated profile", async () => {
    const response = await request(app)
      .get("/api/v1/admin/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: userId,
        fullName: "David Miller",
        email: initialEmail,
        phone: null,
        location: null,
        profilePhoto: null,
        role: "ADMIN",
      }),
    );
    expect(response.body.password).toBeUndefined();
  });

  it("updates profile fields", async () => {
    const response = await request(app)
      .patch("/api/v1/admin/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fullName: "David Kingsley",
        phone: "+234706975544",
        location: "Lagos, Nigeria",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        fullName: "David Kingsley",
        phone: "+234706975544",
        location: "Lagos, Nigeria",
      }),
    );
  });

  it("changes email with the current password", async () => {
    const response = await request(app)
      .patch("/api/v1/admin/profile/email")
      .set("Authorization", `Bearer ${token}`)
      .send({ newEmail: updatedEmail, password });

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(updatedEmail);
    await expect(prismaClient.user.findUnique({ where: { id: userId } })).resolves.toEqual(
      expect.objectContaining({ email: updatedEmail }),
    );
  });
});
