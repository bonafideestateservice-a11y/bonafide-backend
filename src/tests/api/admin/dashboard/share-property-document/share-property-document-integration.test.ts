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

const fx = createFixtures("share-purchase-document");

beforeAll(() => {
  uploadPrivateDocument.mockImplementation(async () => ({
    publicId: `bonafide-services/purchase-documents/${Date.now()}`,
    resourceType: "image",
    format: "pdf",
  }));
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

describe("POST /api/v1/admin/property-requests/:id/documents", () => {
  it("shares a document that the client then sees under Available documents", async () => {
    const admin = await fx.createUser("ADMIN", "admin");
    const client = await fx.createUser("CLIENT", "client");
    const purchase = await fx.createPurchase(client.id, "OWNERSHIP_TRANSFER");

    const shared = await request(app)
      .post(`/api/v1/admin/property-requests/${purchase.id}/documents`)
      .set("Authorization", `Bearer ${admin.token}`)
      .field("name", "Property purchase document")
      .attach("file", Buffer.from("%PDF"), {
        filename: "deed.pdf",
        contentType: "application/pdf",
      });

    expect(shared.status).toBe(201);
    expect(shared.body).toMatchObject({ source: "BONAFIDE", status: "Available" });
    const seen = await request(app)
      .get(`/api/v1/client/property-requests/${purchase.id}/documents`)
      .set("Authorization", `Bearer ${client.token}`);
    expect(seen.body.available.map((d: { name: string }) => d.name)).toEqual([
      "Property purchase document",
    ]);
  });

  it("returns 404 for an unknown request and 403 for clients", async () => {
    const admin = await fx.createUser("ADMIN", "admin2");
    const client = await fx.createUser("CLIENT", "client2");
    const send = (id: string, token: string) =>
      request(app)
        .post(`/api/v1/admin/property-requests/${id}/documents`)
        .set("Authorization", `Bearer ${token}`)
        .attach("file", Buffer.from("%PDF"), { filename: "a.pdf", contentType: "application/pdf" });
    expect((await send("missing", admin.token)).status).toBe(404);
    const purchase = await fx.createPurchase(client.id, "SUBMITTED");
    expect((await send(purchase.id, client.token)).status).toBe(403);
  });
});
