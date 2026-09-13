import app from "./app";
import { config } from "./config";
import { logger } from "./utils/logger";

const server = app.listen(config.port, () => {
  logger.info(`Server running in ${config.env} mode on http://localhost:${config.port}`);
  logger.info(`Docs available at http://localhost:${config.port}/docs`);
});

const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default server;