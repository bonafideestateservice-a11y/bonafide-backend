import { createPropertyInquiryHandler } from "../../../../../api/client/properties/handlers/create-property-inquiry";
import {
  createPropertyInquiry,
  isPropertyVisible,
} from "../../../../../api/client/properties/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/client/properties/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedVisible = isPropertyVisible as jest.Mock;
const mockedCreate = createPropertyInquiry as jest.Mock;
const call = (body: unknown) =>
  callHandler(createPropertyInquiryHandler, { params: { id: "p1" }, user: { id: "u1" }, body });

describe("createPropertyInquiryHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedVisible.mockResolvedValue(true);
  });

  it("saves the trimmed message", async () => {
    const createdAt = new Date("2026-10-01T00:00:00.000Z");
    mockedCreate.mockResolvedValue({ id: "i1", propertyId: "p1", message: "Hello", createdAt });

    const { res } = await call({ message: "  Hello  " });

    expect(mockedCreate).toHaveBeenCalledWith("p1", "u1", "Hello");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      id: "i1",
      propertyId: "p1",
      message: "Hello",
      createdAt: createdAt.toISOString(),
    });
  });

  it.each([[{}], [{ message: "  " }], [{ message: 5 }], [{ message: "x".repeat(2001) }]])(
    "returns 400 for body %j",
    async (body) => {
      const { next } = await call(body);
      expect(errorStatus(next)).toBe(400);
      expect(mockedCreate).not.toHaveBeenCalled();
    },
  );

  it("returns 404 when the property isn't published", async () => {
    mockedVisible.mockResolvedValue(false);
    const { next } = await call({ message: "Hi" });
    expect(errorStatus(next)).toBe(404);
  });

  it("returns 500 when saving fails", async () => {
    mockedCreate.mockRejectedValue(new Error("db down"));
    const { next } = await call({ message: "Hi" });
    expect(errorStatus(next)).toBe(500);
  });
});
