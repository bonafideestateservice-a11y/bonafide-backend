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

class AppEvents extends EventEmitter {}

export const appEvents = new AppEvents();

import "./listeners";
