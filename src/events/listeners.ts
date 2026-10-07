import { appEvents, AppEventPayloads, AppEventTypes, PayloadEventType } from "./index";
import { enqueueNotificationEvent } from "../jobs/notifications/queue";
import { recordActivity } from "../api/services/database/activity-log";
import { logger } from "../utils/logger";

/**
 * Notification work runs in the BullMQ workers (see src/jobs/notifications).
 * Listeners only queue the event, so emitting stays non-blocking for endpoints.
 */
const notificationEvents: PayloadEventType[] = [
  AppEventTypes.USER_REGISTERED,
  AppEventTypes.PAYMENT_RECEIVED,
  AppEventTypes.FORGOT_PASSWORD,
  AppEventTypes.VERIFICATION_REQUEST_CREATED,
  AppEventTypes.REPORT_UPLOADED,
  AppEventTypes.AGENT_ASSIGNED,
  AppEventTypes.INSPECTION_STARTED,
];

notificationEvents.forEach((eventType) => {
  appEvents.on(eventType, (payload: AppEventPayloads[typeof eventType]) => {
    enqueueNotificationEvent(eventType, payload).catch((error) => {
      logger.error(`[event] ${eventType} could not be queued`, {
        message: error instanceof Error ? error.message : String(error),
      });
    });
    recordActivity(eventType, payload).catch((error) => {
      logger.error(`[event] ${eventType} activity could not be recorded`, {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
});
