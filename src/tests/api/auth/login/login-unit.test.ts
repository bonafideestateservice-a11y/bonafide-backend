jest.mock("../../../../api/services/database/user", () => ({ findUserByEmail: jest.fn() }));
jest.mock("../../../../utils/password", () => ({ verifyPassword: jest.fn() }));
jest.mock("../../../../utils/jwt", () => ({ generateToken: jest.fn(() => "jwt") }));
jest.mock("../../../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { login } from "../../../../api/auth/handlers/login";
import { findUserByEmail } from "../../../../api/services/database/user";
import { verifyPassword } from "../../../../utils/password";
import { generateToken } from "../../../../utils/jwt";
import { callHandler, errorStatus } from "../../../helpers/http";

const findUser = findUserByEmail as jest.Mock;
const verify = verifyPassword as jest.Mock;

const user = (role: string, extra = {}) => ({
  id: "u1",
  email: "ada@example.com",
  password: "hash",
  role,
  status: "ACTIVE",
  ...extra,
});
const body = { email: "  Ada@Example.com ", password: "secret123" };

describe("login (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verify.mockResolvedValue(true);
  });

  it.each(["CLIENT", "ADMIN", "AGENT"])("logs in a %s and returns the role", async (role) => {
    findUser.mockResolvedValue(user(role));
    const { res } = await callHandler(login, { body });

    expect(findUser).toHaveBeenCalledWith("ada@example.com");
    expect(verify).toHaveBeenCalledWith("secret123", "hash");
    expect(generateToken).toHaveBeenCalledWith({ id: "u1" });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({ token: "jwt", user: { id: "u1", role } });
    expect(payload.user).not.toHaveProperty("password");
  });

  it.each([
    {},
    { email: " ", password: "x" },
    { email: "a@b.co" },
    { email: "a@b.co", password: 1 },
  ])("rejects body %j", async (invalid) => {
    const { next } = await callHandler(login, { body: invalid });
    expect(errorStatus(next)).toBe(400);
    expect(findUser).not.toHaveBeenCalled();
  });

  it("gives unknown emails and wrong passwords the same 401", async () => {
    findUser.mockResolvedValue(null);
    const unknown = await callHandler(login, { body });

    findUser.mockResolvedValue(user("CLIENT"));
    verify.mockResolvedValue(false);
    const wrong = await callHandler(login, { body });

    expect(errorStatus(unknown.next)).toBe(401);
    expect(errorStatus(wrong.next)).toBe(401);
    expect(unknown.next.mock.calls[0][0].message).toBe(wrong.next.mock.calls[0][0].message);
  });

  it("returns 401 for a social-only account", async () => {
    findUser.mockResolvedValue(user("CLIENT", { password: null }));
    const { next } = await callHandler(login, { body });
    expect(errorStatus(next)).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns 403 for a suspended account", async () => {
    findUser.mockResolvedValue(user("AGENT", { status: "SUSPENDED" }));
    const { next } = await callHandler(login, { body });
    expect(errorStatus(next)).toBe(403);
  });

  it("returns 500 when the lookup fails", async () => {
    findUser.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(login, { body });
    expect(errorStatus(next)).toBe(500);
  });
});
