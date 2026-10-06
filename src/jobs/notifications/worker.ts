import { createWorker } from "../../libs/bullmq/bullmq";
import { QueueName } from "../queues";
import { processNotificationDelivery, processNotificationEvent } from "./processors";

export const startNotificationWorkers = () => [
  createWorker(QueueName.NOTIFICATION_EVENTS, processNotificationEvent, {
    concurrency: Number(process.env.NOTIFICATION_EVENT_CONCURRENCY) || 5,
  }),
  createWorker(QueueName.NOTIFICATION_DELIVERIES, processNotificationDelivery, {
    concurrency: Number(process.env.NOTIFICATION_DELIVERY_CONCURRENCY) || 10,
  }),
];
