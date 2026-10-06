import type { Worker } from "bullmq";
import { closeQueues } from "../libs/bullmq";
import { isRedisConfigured } from "../libs/redis";
import { logger } from "../utils/logger";
import { startNotificationWorkers } from "./notifications/worker";

let workers: Worker[] = [];

export const initJobs = () => {
  if (!isRedisConfigured()) {
    logger.warn("REDIS_URL is not configured; background workers are disabled");
    return;
  }

  workers = [...startNotificationWorkers()];
  logger.info(`Background workers started count=${workers.length}`);
};

/** Waits for in-flight jobs, then releases every queue and worker connection. */
export const closeJobs = async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  workers = [];
  await closeQueues();
  logger.info("Background workers stopped");
};
