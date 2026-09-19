import { appEvents, AppEventTypes } from "./index";
import { logger } from "../utils/logger";

appEvents.on(AppEventTypes.USER_REGISTERED, (payload: { userId: string; email: string }) => {
  logger.info(`[event] USER_REGISTERED for ${payload.email}`);
});

appEvents.on(AppEventTypes.PAYMENT_RECEIVED, (payload: { amount: number; reference: string }) => {
  logger.info(`[event] PAYMENT_RECEIVED ${payload.reference} (${payload.amount})`);
});
