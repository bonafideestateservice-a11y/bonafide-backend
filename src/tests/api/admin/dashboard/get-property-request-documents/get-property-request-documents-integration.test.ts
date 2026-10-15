const uploadPrivateDocument = jest.fn();
jest.mock("../../../../../libs/cloudinary/documents", () => ({
  uploadPrivateDocument,
  signedDocumentLinks: (file: { publicId: string }) => ({
    viewUrl: `https://api.cloudinary.com/view/${file.publicId}`,
    downloadUrl: `https://api.cloudinary.com/download/${file.publicId}`,
    linksExpireAt: "2026-10-17T10:15:00.000Z",
  }),
}));

import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-purchase-documents");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

describe("GET /api/v1/admin/property-requests/:id/documents", () => {
  it("shows an admin the documents the client submitted; clients get 403", async () => {
    const admin = await fx.createUser("ADMIN", "admin");
    const client = await fx.createUser("CLIENT", "client");
    const purchase = await fx.createPurchase(client.id, "IN_PROGRESS");
    await prismaClient.propertyRequestDocument.create({
      data: {
        requestId: purchase.id,
        source: "CLIENT",
        name: "Proof of funds",
        fileName: "funds.png",
        fileType: "image/png",
        fileSizeBytes: 50,
        publicId: "docs/funds",
        resourceType: "image",
        format: "png",
      },
    });
    const get = (token: string) =>
      request(app)
        .get(`/api/v1/admin/property-requests/${purchase.id}/documents`)
        .set("Authorization", `Bearer ${token}`);

    const response = await get(admin.token);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      available: [],
      submitted: [expect.objectContaining({ name: "Proof of funds", fileType: "PNG" })],
    });
    expect((await get(client.token)).status).toBe(403);
  });
});
