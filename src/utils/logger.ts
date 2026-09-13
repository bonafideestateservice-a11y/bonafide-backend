import { config } from "../config";

type LogLevel = "debug" | "info" | "warn" | "error" | "http";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  http: 25,
  warn: 30,
  error: 40,
};

const threshold = LEVELS[(config.logLevel as LogLevel) || "info"];

const log = (level: LogLevel, message: string) => {
  if (LEVELS[level] < threshold) return;
  const timestamp = new Date().toISOString();
  // eslint-disable-next-line no-console
  console[level === "http" || level === "debug" ? "log" : level](`[${timestamp}] [${level.toUpperCase()}] ${message}`);
};

export const logger = {
  debug: (message: string) => log("debug", message),
  info: (message: string) => log("info", message),
  http: (message: string) => log("http", message),
  warn: (message: string) => log("warn", message),
  error: (message: string) => log("error", message),
};