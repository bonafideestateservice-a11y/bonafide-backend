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

const log = (level: LogLevel, message: string, meta?: unknown) => {
  if (LEVELS[level] < threshold) return;
  const timestamp = new Date().toISOString();
  const rendered = meta === undefined ? message : `${message} ${JSON.stringify(meta)}`;
  // eslint-disable-next-line no-console
  console[level === "http" || level === "debug" ? "log" : level](
    `[${timestamp}] [${level.toUpperCase()}] ${rendered}`,
  );
};

export const logger = {
  debug: (message: string, meta?: unknown) => log("debug", message, meta),
  info: (message: string, meta?: unknown) => log("info", message, meta),
  http: (message: string, meta?: unknown) => log("http", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
};
