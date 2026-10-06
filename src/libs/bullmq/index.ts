import { DefaultJobOptions, Queue } from "bullmq";
import type { Redis } from "ioredis";
import { createRedisConnection } from "../redis";

export const queuePrefix = process.env.BULLMQ_PREFIX || "bonafide";

export const defaultJobOptions: DefaultJobOptions = {
  attempts: Number(process.env.BULLMQ_JOB_ATTEMPTS) || 5,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

const queues = new Map<string, Queue>();
let producerConnection: Redis | undefined;

/**
 * Producers fail fast when Redis is unavailable so callers can log the failure
 * instead of buffering jobs in memory.
 */
function getProducerConnection(): Redis {
  producerConnection ??= createRedisConnection({ enableOfflineQueue: false });
  return producerConnection;
}

export function getQueue<DataType = unknown>(name: string): Queue<DataType> {
  let queue = queues.get(name);

  if (!queue) {
    queue = new Queue(name, {
      connection: getProducerConnection(),
      prefix: queuePrefix,
      defaultJobOptions,
    });
    queues.set(name, queue);
  }

  return queue as Queue<DataType>;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();

  if (producerConnection) {
    await producerConnection.quit();
    producerConnection = undefined;
  }
}
