export enum QueueName {
  /** One job per emitted app event; fans out into delivery jobs. */
  NOTIFICATION_EVENTS = "notification-events",
  /** One job per recipient per channel (email or in-app push). */
  NOTIFICATION_DELIVERIES = "notification-deliveries",
}
