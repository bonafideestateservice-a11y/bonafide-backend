import { JobsOptions, Processor, Worker, WorkerOptions } from "bullmq";
import { logger } from "../../utils/logger";
import { createRedisConnection } from "../redis";
import { getQueue, queuePrefix } from "./index";

export interface QueueJob<DataType> {
  name: string;
  data: DataType;
  opts?: JobsOptions;
}

export async function addJob<DataType>(
  queueName: string,
  { name, data, opts }: QueueJob<DataType>,
) {
  return getQueue<DataType>(queueName).add(name as never, data as never, opts);
}

export async function addJobs<DataType>(queueName: string, jobs: QueueJob<DataType>[]) {
  if (jobs.length === 0) return [];
  return getQueue<DataType>(queueName).addBulk(jobs as never);
}

export type CreateWorkerOptions = Omit<WorkerOptions, "connection" | "prefix">;

/**
 * Start a worker on its own connection. BullMQ workers block on Redis, so they
 * require `maxRetriesPerRequest: null`.
 */
export function createWorker<DataType, ResultType = unknown>(
  queueName: string,
  processor: Processor<DataType, ResultType>,
  options: CreateWorkerOptions = {},
): Worker<DataType, ResultType> {
  const connection = createRedisConnection({ maxRetriesPerRequest: null });
  const worker = new Worker<DataType, ResultType>(queueName, processor, {
    ...options,
    connection,
    prefix: queuePrefix,
  });

  // Workers do not close connections they are given, so release it here.
  worker.on("closed", () => {
    connection.quit().catch(() => connection.disconnect());
  });

  // Job data can hold OTPs and personal details, so it is never logged.
  worker.on("failed", (job, error) => {
    logger.error(`[queue] ${queueName} job failed`, {
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      message: error.message,
    });
  });

  worker.on("error", (error) => {
    logger.error(`[queue] ${queueName} worker error`, { message: error.message });
  });

  return worker;
}
