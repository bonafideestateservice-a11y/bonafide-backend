import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
let adminId: string;
let propertyId: string;
let adminToken: string;

beforeAll(async () => {
  const admin = await prismaClient.user.create({
    data: {
      fullName: "Publish Property Admin",
      email: `publish-property-admin-${suffix}@example.com`,
      role: "ADMIN",
    },
  });
  adminId = admin.id;
  adminToken = generateToken({ id: admin.id });

  const property = await prismaClient.property.create({
    data: { name: "Toggle Dashboard Property", address: "Lagos, Nigeria" },
  });
  propertyId = property.id;
});

afterAll(async () => {
  await prismaClient.property.delete({ where: { id: propertyId } });
  await prismaClient.user.delete({ where: { id: adminId } });
  await prismaClient.$disconnect();
});

describe("PATCH /api/v1/admin/properties/:id/publish", () => {
  it("toggles publication state on repeated requests", async () => {
    const firstResponse = await request(app)
      .patch(`/api/v1/admin/properties/${propertyId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    const secondResponse = await request(app)
      .patch(`/api/v1/admin/properties/${propertyId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.isPublished).toBe(true);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.isPublished).toBe(false);
  });

  it("returns not found for an unknown property", async () => {
    const response = await request(app)
      .patch("/api/v1/admin/properties/property-does-not-exist/publish")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});
