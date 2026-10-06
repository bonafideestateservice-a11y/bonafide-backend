import { Redis, RedisOptions } from "ioredis";
import { logger } from "../../utils/logger";

export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

/**
 * Create a new Redis connection from REDIS_URL. Callers own the returned
 * connection and must close it with `quit()` on shutdown.
 */
export function createRedisConnection(options: RedisOptions = {}): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is required for Redis operations");
  }

  const connection = new Redis(url, options);

  // The URL may contain credentials, so only the error message is logged.
  connection.on("error", (error) => {
    logger.error("[redis] connection error", { message: error.message });
  });

  return connection;
}
