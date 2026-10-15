import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
  secure: true,
});

/** How long a signed View or Download link works. */
const LINK_TTL_SECONDS = 15 * 60;

export interface PrivateFile {
  publicId: string;
  resourceType: string;
  format: string;
}

/**
 * Uploads a purchase document as a private Cloudinary asset: it has no public URL and can
 * only be opened with a link signed by signedDocumentLinks.
 */
export async function uploadPrivateDocument(file: Express.Multer.File): Promise<PrivateFile> {
  const result = await cloudinary.uploader.upload(
    `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
    // PDFs are "image" assets in Cloudinary, like JPG and PNG.
    { folder: "bonafide-services/purchase-documents", type: "private", resource_type: "image" },
  );
  return { publicId: result.public_id, resourceType: result.resource_type, format: result.format };
}

/** Short-lived links to open (view) or save (download) a private document. */
export function signedDocumentLinks(file: PrivateFile) {
  const expiresAt = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
  const link = (attachment: boolean) =>
    cloudinary.utils.private_download_url(file.publicId, file.format, {
      resource_type: file.resourceType,
      type: "private",
      expires_at: expiresAt,
      attachment,
    });
  return {
    viewUrl: link(false),
    downloadUrl: link(true),
    linksExpireAt: new Date(expiresAt * 1000).toISOString(),
  };
}
