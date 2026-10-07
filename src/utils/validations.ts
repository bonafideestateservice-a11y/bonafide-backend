import { z } from "zod";

export const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

/** `page` and `limit` query params: positive integers, limit at most 100. Null when invalid. */
export const parsePaging = (
  query: Record<string, unknown>,
  defaultLimit = 20,
): { page: number; limit: number } | null => {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? defaultLimit : Number(query.limit);
  const valid = (n: number) => Number.isInteger(n) && n >= 1;
  return valid(page) && valid(limit) && limit <= 100 ? { page, limit } : null;
};
