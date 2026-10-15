import { Prisma } from "@prisma/client";
import { idempotent } from "../../middlewares/idempotency";
import { prismaClient } from "../../utils/prisma";
import { errorStatus } from "../helpers/http";

jest.mock("../../utils/prisma", () => ({
  prismaClient: {
    idempotencyKey: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  },
}));
jest.mock("../../utils/logger", () => ({ logger: { error: jest.fn() } }));

const store = prismaClient.idempotencyKey as unknown as Record<string, jest.Mock>;
const clash = new Prisma.PrismaClientKnownRequestError("unique", {
  code: "P2002",
  clientVersion: "5",
});

const run = async (key?: string) => {
  const req = {
    header: () => key,
    method: "POST",
    originalUrl: "/api/v1/x?y=1",
    user: { id: "u1" },
  };
  const res = {
    statusCode: 201,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };
  const originalJson = res.json;
  const next = jest.fn();
  await idempotent(req as never, res as never, next);
  return { res, next, originalJson };
};

describe("idempotent middleware", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does nothing without a key", async () => {
    const { next } = await run();
    expect(next).toHaveBeenCalledWith();
    expect(store.create).not.toHaveBeenCalled();
  });

  it("records a new key and saves the response when it's sent", async () => {
    store.create.mockResolvedValue({});
    const { res, next } = await run("k1");
    expect(store.create).toHaveBeenCalledWith({
      data: { userId: "u1", route: "POST /api/v1/x", key: "k1" },
    });
    expect(next).toHaveBeenCalledWith();

    res.json({ id: "r1" });
    expect(store.update).toHaveBeenCalledWith({
      where: { userId_route_key: { userId: "u1", route: "POST /api/v1/x", key: "k1" } },
      data: { statusCode: 201, body: { id: "r1" } },
    });
  });

  it("forgets the key after a server error so the client can retry", async () => {
    store.create.mockResolvedValue({});
    const { res } = await run("k1");
    res.statusCode = 500;
    res.json({ message: "boom" });
    expect(store.delete).toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it("replays the saved response for a repeated key", async () => {
    store.create.mockRejectedValue(clash);
    store.findUnique.mockResolvedValue({ statusCode: 201, body: { id: "r1" } });
    const { res, next, originalJson } = await run("k1");
    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Idempotent-Replayed", "true");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(originalJson).toHaveBeenCalledWith({ id: "r1" });
  });

  it("returns 409 while the first request is still running", async () => {
    store.create.mockRejectedValue(clash);
    store.findUnique.mockResolvedValue({ statusCode: null, body: null });
    const { next } = await run("k1");
    expect(errorStatus(next)).toBe(409);
  });

  it("returns 400 for a key over 255 characters", async () => {
    const { next } = await run("x".repeat(256));
    expect(errorStatus(next)).toBe(400);
  });
});
