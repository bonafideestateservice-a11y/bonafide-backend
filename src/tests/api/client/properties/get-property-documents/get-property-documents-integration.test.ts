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

const fx = createFixtures("purchase-documents");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const doc = (requestId: string, source: "BONAFIDE" | "CLIENT", name: string) =>
  prismaClient.propertyRequestDocument.create({
    data: {
      requestId,
      source,
      name,
      fileName: `${name}.pdf`,
      fileType: "application/pdf",
      fileSizeBytes: 100,
      publicId: `docs/${name}`,
      resourceType: "image",
      format: "pdf",
    },
  });

describe("GET /api/v1/client/property-requests/:id/documents", () => {
  it("splits shared and submitted documents, with signed links", async () => {
    const client = await fx.createUser("CLIENT", "client");
    const purchase = await fx.createPurchase(client.id, "OWNERSHIP_TRANSFER");
    await doc(purchase.id, "BONAFIDE", "Property purchase document");
    await doc(purchase.id, "CLIENT", "Submitted purchase document");

    const response = await request(app)
      .get(`/api/v1/client/property-requests/${purchase.id}/documents`)
      .set("Authorization", `Bearer ${client.token}`);

    expect(response.status).toBe(200);
    expect(response.body.available).toEqual([
      expect.objectContaining({
        name: "Property purchase document",
        status: "Available",
        fileType: "PDF",
        viewUrl: "https://api.cloudinary.com/view/docs/Property purchase document",
      }),
    ]);
    expect(response.body.submitted).toEqual([
      expect.objectContaining({ name: "Submitted purchase document", status: "Submitted" }),
    ]);
    // The request shows how many documents it has.
    const detail = await request(app)
      .get(`/api/v1/client/property-requests/${purchase.id}`)
      .set("Authorization", `Bearer ${client.token}`);
    expect(detail.body.documentCount).toBe(2);
  });

  it("returns 404 for another client's request", async () => {
    const owner = await fx.createUser("CLIENT", "owner");
    const other = await fx.createUser("CLIENT", "other");
    const purchase = await fx.createPurchase(owner.id, "SUBMITTED");
    const response = await request(app)
      .get(`/api/v1/client/property-requests/${purchase.id}/documents`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(response.status).toBe(404);
  });
});
