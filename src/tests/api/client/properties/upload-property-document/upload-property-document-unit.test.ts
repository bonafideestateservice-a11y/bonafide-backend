import { uploadPropertyDocumentHandler } from "../../../../../api/client/properties/handlers/upload-property-document";
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
const file = { originalname: "offer.pdf" };
const call = () =>
  callHandler(uploadPropertyDocumentHandler, {
    params: { id: "r1" },
    user: { id: "u1" },
    file,
    body: { name: "Signed offer" },
  });

describe("uploadPropertyDocumentHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedExists.mockResolvedValue(true);
  });

  it("saves the file as a CLIENT document", async () => {
    mockedSave.mockResolvedValue({ id: "d1" });
    const { res } = await call();
    expect(mockedSave).toHaveBeenCalledWith("r1", "CLIENT", file, "Signed offer");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: "d1" });
  });

  it("returns 404 for another client's request", async () => {
    mockedExists.mockResolvedValue(false);
    expect(errorStatus((await call()).next)).toBe(404);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("passes validation errors through and turns others into 500", async () => {
    mockedSave.mockRejectedValueOnce(new BadRequestError("name is required."));
    expect(errorStatus((await call()).next)).toBe(400);
    mockedSave.mockRejectedValueOnce(new Error("cloudinary down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
