import { getPropertyDocumentsHandler } from "../../../../../api/client/properties/handlers/get-property-documents";
import { propertyRequestExists } from "../../../../../api/services/database/property-request";
import { getGroupedDocuments } from "../../../../../api/services/property-documents";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../api/services/property-documents");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedExists = propertyRequestExists as jest.Mock;
const mockedGrouped = getGroupedDocuments as jest.Mock;
const call = () =>
  callHandler(getPropertyDocumentsHandler, { params: { id: "r1" }, user: { id: "u1" } });

describe("getPropertyDocumentsHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the client's documents, grouped", async () => {
    mockedExists.mockResolvedValue(true);
    mockedGrouped.mockResolvedValue({ available: [{ id: "d1" }], submitted: [] });
    const { res } = await call();
    expect(mockedExists).toHaveBeenCalledWith("r1", "u1");
    expect(res.json).toHaveBeenCalledWith({ available: [{ id: "d1" }], submitted: [] });
  });

  it("returns 404 for another client's request and 500 on errors", async () => {
    mockedExists.mockResolvedValueOnce(false);
    expect(errorStatus((await call()).next)).toBe(404);
    mockedExists.mockRejectedValueOnce(new Error("db down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
