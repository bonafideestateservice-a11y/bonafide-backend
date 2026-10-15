const upload = jest.fn();
jest.mock("cloudinary", () => {
  const actual = jest.requireActual("cloudinary");
  return {
    v2: { ...actual.v2, config: actual.v2.config, uploader: { upload }, utils: actual.v2.utils },
  };
});

import { signedDocumentLinks, uploadPrivateDocument } from "../../libs/cloudinary/documents";
import { v2 as cloudinary } from "cloudinary";

describe("private Cloudinary documents", () => {
  beforeAll(() => cloudinary.config({ cloud_name: "demo", api_key: "123", api_secret: "abc" }));

  it("uploads as a private image asset and keeps the ids needed for signing", async () => {
    upload.mockResolvedValue({
      public_id: "bonafide-services/purchase-documents/deed",
      resource_type: "image",
      format: "pdf",
    });
    const file = {
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF"),
    } as Express.Multer.File;

    await expect(uploadPrivateDocument(file)).resolves.toEqual({
      publicId: "bonafide-services/purchase-documents/deed",
      resourceType: "image",
      format: "pdf",
    });
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^data:application\/pdf;base64,/), {
      folder: "bonafide-services/purchase-documents",
      type: "private",
      resource_type: "image",
    });
  });

  it("signs view and download links that expire in 15 minutes", () => {
    const before = Math.floor(Date.now() / 1000);
    const links = signedDocumentLinks({
      publicId: "docs/deed",
      resourceType: "image",
      format: "pdf",
    });

    for (const url of [links.viewUrl, links.downloadUrl]) {
      expect(url).toMatch(/^https:\/\/api\.cloudinary\.com\/v1_1\/demo\/image\/download\?/);
      expect(url).toContain("type=private");
      expect(url).toMatch(/signature=\w+/);
    }
    expect(links.viewUrl).toContain("attachment=false");
    expect(links.downloadUrl).toContain("attachment=true");
    const expiresAt = Number(new URL(links.viewUrl).searchParams.get("expires_at"));
    expect(expiresAt - before).toBeGreaterThanOrEqual(15 * 60);
    expect(expiresAt - before).toBeLessThanOrEqual(15 * 60 + 2);
  });
});
