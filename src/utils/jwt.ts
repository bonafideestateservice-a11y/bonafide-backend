import jwt, { SignOptions } from "jsonwebtoken";

import { config } from "../config";

interface TokenPayload {
  id: string;
  email: string;
  role: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as SignOptions["expiresIn"],
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiresIn as SignOptions["expiresIn"],
  });
};

export const verifyRefreshToken = (token: string) => {
  return jwt.verify(token, config.jwt.secret) as TokenPayload;
};