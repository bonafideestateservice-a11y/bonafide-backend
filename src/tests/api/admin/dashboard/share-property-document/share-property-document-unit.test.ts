import { sharePropertyDocumentHandler } from "../../../../../api/admin/dashboard/handlers/share-property-document";
import { propertyRequestExists } from "../../../../../api/services/database/property-request";
import { saveDocument } from "../../../../../api/services/property-documents";
import { BadRequestError } from "../../../../../exceptions";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../api/services/property-documents");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedExists = propertyRequestExists as jest.Mock;
const mockedSave = saveDocument as jest.Mock;
const file = { originalname: "deed.pdf" };
const call = () =>
  callHandler(sharePropertyDocumentHandler, { params: { id: "r1" }, file, body: {} });

describe("sharePropertyDocumentHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedExists.mockResolvedValue(true);
  });

  it("saves the file as a BONAFIDE (shared) document", async () => {
    mockedSave.mockResolvedValue({ id: "d1" });
    const { res } = await call();
    expect(mockedSave).toHaveBeenCalledWith("r1", "BONAFIDE", file, undefined);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("returns 404, 400 and 500 as appropriate", async () => {
    mockedExists.mockResolvedValueOnce(false);
    expect(errorStatus((await call()).next)).toBe(404);
    mockedSave.mockRejectedValueOnce(new BadRequestError("Attach the document in the file field."));
    expect(errorStatus((await call()).next)).toBe(400);
    mockedSave.mockRejectedValueOnce(new Error("cloudinary down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
