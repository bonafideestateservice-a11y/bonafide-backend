import type { Job, JobsOptions } from "bullmq";
import { AppEventPayloads, AppEventTypes, PayloadEventType } from "../../events";
import { addJob, addJobs } from "../../libs/bullmq/bullmq";
import { QueueName } from "../queues";
import { NotificationDelivery } from "./types";

/** Jobs carrying OTPs are removed from Redis as soon as they finish. */
const jobOptionsFor = (eventType: string): JobsOptions | undefined =>
  eventType === AppEventTypes.FORGOT_PASSWORD
    ? { removeOnComplete: true, removeOnFail: true }
    : undefined;

export const enqueueNotificationEvent = <K extends PayloadEventType>(
  eventType: K,
  payload: AppEventPayloads[K],
) =>
  addJob(QueueName.NOTIFICATION_EVENTS, {
    name: eventType,
    data: payload,
    opts: jobOptionsFor(eventType),
  });

/**
 * Delivery job ids are derived from the event job, so if the event job is
 * retried after enqueueing, BullMQ ignores the duplicates.
 */
export const enqueueNotificationDeliveries = (
  eventJob: Pick<Job, "id" | "name">,
  deliveries: NotificationDelivery[],
) =>
  addJobs<NotificationDelivery>(
    QueueName.NOTIFICATION_DELIVERIES,
    deliveries.map((delivery) => ({
      name: eventJob.name,
      data: delivery,
      opts: {
        ...jobOptionsFor(eventJob.name),
        jobId: `${eventJob.id}-${delivery.recipient.id}-${delivery.channel}`,
      },
    })),
  );
