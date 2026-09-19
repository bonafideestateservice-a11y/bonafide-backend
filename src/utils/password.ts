import bcrypt from "bcryptjs";

export const BCRYPT_SALT_ROUNDS = 10;

export const hashPassword = (plainPassword: string): Promise<string> => {
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
};

export const verifyPassword = (plainPassword: string, hashedPassword: string): Promise<boolean> => {
  return bcrypt.compare(plainPassword, hashedPassword);
};
