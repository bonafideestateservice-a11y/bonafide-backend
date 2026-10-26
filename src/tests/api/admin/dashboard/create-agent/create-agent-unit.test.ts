jest.mock("../../../../../api/admin/dashboard/services/database/user", () => ({
  createAgent: jest.fn(),
  findUserByEmail: jest.fn(),
}));
jest.mock("../../../../../utils/password", () => ({ hashPassword: jest.fn() }));
jest.mock("../../../../../utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import { Prisma } from "@prisma/client";
import { createAgentHandler } from "../../../../../api/admin/dashboard/handlers/create-agent";
import {
  createAgent,
  findUserByEmail,
} from "../../../../../api/admin/dashboard/services/database/user";
import { hashPassword } from "../../../../../utils/password";
import { callHandler, errorStatus } from "../../../../helpers/http";

const create = createAgent as jest.Mock;
const findByEmail = findUserByEmail as jest.Mock;
const hash = hashPassword as jest.Mock;

const body = {
  fullName: "  Tunde Bello ",
  email: " Tunde@Example.com ",
  password: "Temp@1234",
  phone: "+2348012345678",
  region: " Lagos ",
};

describe("createAgentHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findByEmail.mockResolvedValue(null);
    hash.mockResolvedValue("hashed");
  });

  it("creates the agent with a hashed password and normalized fields", async () => {
    const agent = { id: "ag1", userId: "u1", mustChangePassword: true };
    create.mockResolvedValue(agent);

    const { res, next } = await callHandler(createAgentHandler, { body });

    expect(findByEmail).toHaveBeenCalledWith("tunde@example.com");
    expect(hash).toHaveBeenCalledWith("Temp@1234");
    expect(create).toHaveBeenCalledWith({
      fullName: "Tunde Bello",
      email: "tunde@example.com",
      password: "hashed",
      phone: "+2348012345678",
      region: "Lagos",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(agent);
    expect(next).not.toHaveBeenCalled();
  });

  it("stores blank or missing phone and region as null", async () => {
    create.mockResolvedValue({ id: "ag1" });
    await callHandler(createAgentHandler, {
      body: { fullName: "A", email: "a@b.co", password: "12345678", phone: " " },
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ phone: null, region: null }));
  });

  it.each([
    { ...body, fullName: " " },
    { ...body, email: "not-an-email" },
    { ...body, email: undefined },
    { ...body, password: "short" },
    { ...body, password: undefined },
    { ...body, phone: 123 },
    { ...body, region: ["Lagos"] },
  ])("rejects body %j", async (invalid) => {
    const { next } = await callHandler(createAgentHandler, { body: invalid });
    expect(errorStatus(next)).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 409 when the email is taken", async () => {
    findByEmail.mockResolvedValue({ id: "u9" });
    const { next } = await callHandler(createAgentHandler, { body });
    expect(errorStatus(next)).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 409 when the email is taken during the insert", async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "5",
      }),
    );
    const { next } = await callHandler(createAgentHandler, { body });
    expect(errorStatus(next)).toBe(409);
  });

  it("returns 500 when the insert fails", async () => {
    create.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(createAgentHandler, { body });
    expect(errorStatus(next)).toBe(500);
  });
});
