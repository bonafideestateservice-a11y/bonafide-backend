import {
  AgentAssignedPayload,
  appEvents,
  AppEventTypes,
  InspectionStartedPayload,
  ReportUploadedPayload,
  VerificationRequestCreatedPayload,
} from "./index";
import { logger } from "../utils/logger";

appEvents.on(AppEventTypes.USER_REGISTERED, (payload: { userId: string; email: string }) => {
  logger.info(`[event] USER_REGISTERED for ${payload.email}`);
});

appEvents.on(AppEventTypes.PAYMENT_RECEIVED, (payload: { amount: number; reference: string }) => {
  logger.info(`[event] PAYMENT_RECEIVED ${payload.reference} (${payload.amount})`);
});

appEvents.on(
  AppEventTypes.VERIFICATION_REQUEST_CREATED,
  (payload: VerificationRequestCreatedPayload) => {
    logger.info(
      `[event] VERIFICATION_REQUEST_CREATED requestId=${payload.verificationRequestId} userId=${payload.userId}`,
    );
  },
);

appEvents.on(AppEventTypes.REPORT_UPLOADED, (payload: ReportUploadedPayload) => {
  logger.info(
    `[event] REPORT_UPLOADED reportId=${payload.reportId} requestId=${payload.verificationRequestId} agentId=${payload.submittedByAgentId}`,
  );
});

appEvents.on(AppEventTypes.AGENT_ASSIGNED, (payload: AgentAssignedPayload) => {
  logger.info(
    `[event] AGENT_ASSIGNED assignmentId=${payload.assignmentId} requestId=${payload.verificationRequestId} agentId=${payload.agentId}`,
  );
});

appEvents.on(AppEventTypes.INSPECTION_STARTED, (payload: InspectionStartedPayload) => {
  logger.info(
    `[event] INSPECTION_STARTED assignmentId=${payload.assignmentId} requestId=${payload.verificationRequestId} agentId=${payload.agentId}`,
  );
});
