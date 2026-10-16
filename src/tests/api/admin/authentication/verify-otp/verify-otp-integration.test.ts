import crypto from "crypto";
import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-verify-otp");
let userId: string;
const hashOf = (otp: string) => crypto.createHash("sha256").update(otp).digest("hex");

beforeAll(async () => {
  userId = (await fx.createUser("ADMIN", "user")).id;
});
afterAll(async () => {
  await prismaClient.passwordResetToken.deleteMany({ where: { userId } });
  await fx.cleanup();
  await prismaClient.$disconnect();
});

/** A reset OTP for the user; unique per test so tests don't share codes. */
const issue = async (otp: string, data: { expiresAt?: Date; used?: boolean } = {}) =>
  prismaClient.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashOf(otp),
      expiresAt: data.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
      used: data.used ?? false,
    },
  });

const verify = (body: object) => request(app).post("/api/v1/admin/verify-otp").send(body);

describe("POST /api/v1/admin/verify-otp", () => {
  it("accepts a valid OTP without using it up", async () => {
    const otp = String(100000 + (Date.now() % 900000));
    const token = await issue(otp);

    const response = await verify({ otp: ` ${otp} ` });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "success", message: "OTP verified successfully." });
    // Verifying doesn't consume it; resetting the password does.
    const after = await prismaClient.passwordResetToken.findUniqueOrThrow({
      where: { id: token.id },
    });
    expect(after.used).toBe(false);
  });

  it("rejects an expired or already used OTP", async () => {
    await issue(`EXP-${fx.tag}`, { expiresAt: new Date(Date.now() - 1000) });
    await issue(`USED-${fx.tag}`, { used: true });

    for (const otp of [`EXP-${fx.tag}`, `USED-${fx.tag}`, "never-issued"]) {
      const response = await verify({ otp });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("OTP is invalid or has expired.");
    }
  });

  it("returns 400 without an OTP", async () => {
    const response = await verify({});
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("OTP is required.");
  });
});
