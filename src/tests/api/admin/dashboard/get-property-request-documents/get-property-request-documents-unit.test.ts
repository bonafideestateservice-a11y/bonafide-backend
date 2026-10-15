import { getPropertyRequestDocumentsHandler } from "../../../../../api/admin/dashboard/handlers/get-property-request-documents";
import { propertyRequestExists } from "../../../../../api/services/database/property-request";
import { getGroupedDocuments } from "../../../../../api/services/property-documents";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../api/services/property-documents");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedExists = propertyRequestExists as jest.Mock;
const call = () => callHandler(getPropertyRequestDocumentsHandler, { params: { id: "r1" } });

describe("getPropertyRequestDocumentsHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns any request's documents", async () => {
    mockedExists.mockResolvedValue(true);
    (getGroupedDocuments as jest.Mock).mockResolvedValue({
      available: [],
      submitted: [{ id: "d1" }],
    });
    const { res } = await call();
    expect(mockedExists).toHaveBeenCalledWith("r1");
    expect(res.json).toHaveBeenCalledWith({ available: [], submitted: [{ id: "d1" }] });
  });

  it("returns 404 for an unknown request and 500 on errors", async () => {
    mockedExists.mockResolvedValueOnce(false);
    expect(errorStatus((await call()).next)).toBe(404);
    mockedExists.mockRejectedValueOnce(new Error("db down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
