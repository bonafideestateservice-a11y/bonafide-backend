import { createConsultationRequestHandler } from "../../../../../api/client/properties/handlers/create-consultation-request";
import {
  createPropertyRequest,
  toRequestResponse,
} from "../../../../../api/services/database/property-request";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedCreate = createPropertyRequest as jest.Mock;
(toRequestResponse as jest.Mock).mockImplementation((request) => ({ id: request.id }));
const call = () =>
  callHandler(createConsultationRequestHandler, { params: { id: "p1" }, user: { id: "u1" } });

describe("createConsultationRequestHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a CONSULTATION request with 201", async () => {
    mockedCreate.mockResolvedValue({ request: { id: "r1" }, created: true });
    const { res } = await call();
    expect(mockedCreate).toHaveBeenCalledWith("u1", "p1", "CONSULTATION");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: "r1" });
  });

  it("returns the open request with 200 instead of a duplicate", async () => {
    mockedCreate.mockResolvedValue({ request: { id: "r0" }, created: false });
    const { res } = await call();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: "r0" });
  });

  it("returns 404 for a property that isn't published", async () => {
    mockedCreate.mockResolvedValue(null);
    expect(errorStatus((await call()).next)).toBe(404);
  });

  it("returns 500 when saving fails", async () => {
    mockedCreate.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
