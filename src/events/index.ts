import { EventEmitter } from "events";

export enum AppEventTypes {
  USER_REGISTERED = "USER_REGISTERED",
  USER_LOGIN = "USER_LOGIN",
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
  FORGOT_PASSWORD = "FORGOT_PASSWORD",
  VERIFICATION_REQUEST_CREATED = "VERIFICATION_REQUEST_CREATED",
  REPORT_UPLOADED = "REPORT_UPLOADED",
  AGENT_ASSIGNED = "AGENT_ASSIGNED",
  INSPECTION_STARTED = "INSPECTION_STARTED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  SUBSCRIPTION_ENDED = "SUBSCRIPTION_ENDED",
  PROPERTY_REQUEST_CREATED = "PROPERTY_REQUEST_CREATED",
  PROPERTY_REQUEST_UPDATED = "PROPERTY_REQUEST_UPDATED",
  PROPERTY_PAYMENT_RECEIVED = "PROPERTY_PAYMENT_RECEIVED",
  PROPERTY_PAYMENT_FAILED = "PROPERTY_PAYMENT_FAILED",
  AGENT_CREATED = "AGENT_CREATED",
}

export interface ForgotPasswordPayload {
  userId: string;
  email: string;
  otp: string;
  expiresIn: string;
}

export interface UserRegisteredPayload {
  userId: string;
  email: string;
  firstName: string;
}

export interface PaymentReceivedPayload {
  userId: string;
  email: string;
  firstName: string;
  amount: number;
  reference: string;
  payment_receipt: string;
  booking_ref: string;
  receipt_id: string;
  currency: string;
  service_name?: string;
}

export interface VerificationRequestCreatedPayload {
  verificationRequestId: string;
  userId: string;
}

export interface ReportUploadedPayload {
  reportId: string;
  verificationRequestId: string;
  submittedByAgentId: string;
}

export interface AgentAssignedPayload {
  assignmentId: string;
  verificationRequestId: string;
  agentId: string;
}

export interface InspectionStartedPayload {
  assignmentId: string;
  verificationRequestId: string;
  agentId: string;
}

/** A verification request has just moved to PAYMENT_FAILED (first payment or renewal). */
export interface PaymentFailedPayload {
  verificationRequestId: string;
}

/** A recurring verification's subscription was cancelled or ended. */
export interface SubscriptionEndedPayload {
  verificationRequestId: string;
}

export interface PropertyRequestCreatedPayload {
  propertyRequestId: string;
}

export interface PropertyRequestUpdatedPayload {
  propertyRequestId: string;
  status: string;
  /** The card text shown to the client: the admin's note or the stage's standard message. */
  message: string;
}

export interface PropertyPaymentPayload {
  propertyPaymentId: string;
}

/** An admin created an agent; the welcome email carries a one-time password setup code. */
export interface AgentCreatedPayload {
  userId: string;
  email: string;
  fullName: string;
  setupCode: string;
  expiresIn: string;
}

export interface AppEventPayloads {
  [AppEventTypes.USER_REGISTERED]: UserRegisteredPayload;
  [AppEventTypes.PAYMENT_RECEIVED]: PaymentReceivedPayload;
  [AppEventTypes.FORGOT_PASSWORD]: ForgotPasswordPayload;
  [AppEventTypes.VERIFICATION_REQUEST_CREATED]: VerificationRequestCreatedPayload;
  [AppEventTypes.REPORT_UPLOADED]: ReportUploadedPayload;
  [AppEventTypes.AGENT_ASSIGNED]: AgentAssignedPayload;
  [AppEventTypes.INSPECTION_STARTED]: InspectionStartedPayload;
  [AppEventTypes.PAYMENT_FAILED]: PaymentFailedPayload;
  [AppEventTypes.SUBSCRIPTION_ENDED]: SubscriptionEndedPayload;
  [AppEventTypes.PROPERTY_REQUEST_CREATED]: PropertyRequestCreatedPayload;
  [AppEventTypes.PROPERTY_REQUEST_UPDATED]: PropertyRequestUpdatedPayload;
  [AppEventTypes.PROPERTY_PAYMENT_RECEIVED]: PropertyPaymentPayload;
  [AppEventTypes.PROPERTY_PAYMENT_FAILED]: PropertyPaymentPayload;
  [AppEventTypes.AGENT_CREATED]: AgentCreatedPayload;
}

export type PayloadEventType = keyof AppEventPayloads;

class AppEvents extends EventEmitter {}

export const appEvents = new AppEvents();

import "./listeners";
