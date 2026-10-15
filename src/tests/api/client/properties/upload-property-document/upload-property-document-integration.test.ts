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

const fx = createFixtures("upload-purchase-document");
let client: Awaited<ReturnType<typeof fx.createUser>>;
const pdf = Buffer.from("%PDF-1.4 test");

beforeAll(async () => {
  client = await fx.createUser("CLIENT", "client");
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

const upload = (id: string, token = client.token) =>
  request(app)
    .post(`/api/v1/client/property-requests/${id}/documents`)
    .set("Authorization", `Bearer ${token}`);

describe("POST /api/v1/client/property-requests/:id/documents", () => {
  it("stores a submitted document privately, at any status", async () => {
    const completed = await fx.createPurchase(client.id, "COMPLETED");

    const response = await upload(completed.id)
      .field("name", "Signed offer letter")
      .attach("file", pdf, { filename: "offer.pdf", contentType: "application/pdf" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Signed offer letter",
      source: "CLIENT",
      status: "Submitted",
      fileName: "offer.pdf",
      fileType: "PDF",
      fileSizeBytes: pdf.length,
      viewUrl: expect.stringContaining("https://api.cloudinary.com/view/"),
      downloadUrl: expect.stringContaining("https://api.cloudinary.com/download/"),
    });
    const saved = await prismaClient.propertyRequestDocument.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(saved).toMatchObject({ requestId: completed.id, resourceType: "image", format: "pdf" });
  });

  it("names the document after the file when no name is given", async () => {
    const purchase = await fx.createPurchase(client.id, "SUBMITTED");
    const response = await upload(purchase.id).attach("file", pdf, {
      filename: "Proof of funds.pdf",
      contentType: "application/pdf",
    });
    expect(response.body.name).toBe("Proof of funds");
  });

  it("rejects a missing file, a wrong type, an oversized file and a long name", async () => {
    const purchase = await fx.createPurchase(client.id, "SUBMITTED");
    expect((await upload(purchase.id).field("name", "x")).body.message).toBe(
      "Attach the document in the file field.",
    );
    const wrongType = await upload(purchase.id).attach("file", Buffer.from("x"), {
      filename: "notes.txt",
      contentType: "text/plain",
    });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.message).toBe("Documents must be PDF, JPG or PNG.");
    const tooBig = await upload(purchase.id).attach("file", Buffer.alloc(10 * 1024 * 1024 + 1), {
      filename: "big.pdf",
      contentType: "application/pdf",
    });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.message).toBe("Documents must be at most 10 MB.");
    const longName = await upload(purchase.id)
      .field("name", "x".repeat(121))
      .attach("file", pdf, { filename: "a.pdf", contentType: "application/pdf" });
    expect(longName.status).toBe(400);
  });

  it("returns 404 for another client's request", async () => {
    const other = await fx.createUser("CLIENT", "other");
    const theirs = await fx.createPurchase(other.id, "SUBMITTED");
    const response = await upload(theirs.id).attach("file", pdf, {
      filename: "a.pdf",
      contentType: "application/pdf",
    });
    expect(response.status).toBe(404);
  });
});
