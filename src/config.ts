import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

interface Config {
  env: string;
  port: number;
  databaseUrl: string;
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  corsOrigins: string[];
  logLevel: string;
}

export const config: Config = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || "",
  jwt: {
    secret: process.env.JWT_SECRET || "",
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  logLevel: process.env.LOG_LEVEL || "info",
};