import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
let adminId: string;
let propertyIds: string[] = [];
let adminToken: string;

beforeAll(async () => {
  const admin = await prismaClient.user.create({
    data: {
      fullName: "Properties Dashboard Admin",
      email: `properties-dashboard-admin-${suffix}@example.com`,
      role: "ADMIN",
    },
  });
  adminId = admin.id;
  adminToken = generateToken({ id: admin.id });

  const properties = await Promise.all(
    [
      { name: "Published Dashboard Property", isPublished: true },
      { name: "Unpublished Dashboard Property", isPublished: false },
    ].map((data) =>
      prismaClient.property.create({
        data: { ...data, address: "Lagos, Nigeria", city: "Lagos", country: "Nigeria" },
      }),
    ),
  );
  propertyIds = properties.map((property) => property.id);
});

afterAll(async () => {
  await prismaClient.property.deleteMany({ where: { id: { in: propertyIds } } });
  await prismaClient.user.delete({ where: { id: adminId } });
  await prismaClient.$disconnect();
});

describe("GET /api/v1/admin/properties", () => {
  it("requires admin authentication", async () => {
    const response = await request(app).get("/api/v1/admin/properties");

    expect(response.status).toBe(401);
  });

  it("lists properties with publication filtering and pagination", async () => {
    const response = await request(app)
      .get("/api/v1/admin/properties")
      .query({ status: "published", search: "Published Dashboard", page: 1, limit: 10 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({ page: 1, limit: 10, totalItems: 1, totalPages: 1 });
    expect(response.body.counts).toEqual({ all: 1, published: 1, unpublished: 0 });
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: propertyIds[0],
        title: "Published Dashboard Property",
        isPublished: true,
        location: { area: null, city: "Lagos", country: "Nigeria" },
      }),
    ]);
  });
});
