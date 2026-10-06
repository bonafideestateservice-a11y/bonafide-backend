import "./config";
import { closeJobs, initJobs } from "./jobs";
import { logger } from "./utils/logger";

// Standalone worker process. Run with RUN_WORKERS=false on the API so jobs
// are processed here only.
initJobs();

const shutdown = (signal: string) => {
  logger.info(`${signal} received, stopping workers`);
  closeJobs()
    .catch((error) => logger.error("Error stopping background workers", error))
    .finally(() => process.exit(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
