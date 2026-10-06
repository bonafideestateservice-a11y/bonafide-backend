import { Router } from "express";
import { ROLE } from "@prisma/client";
import { checkJwt } from "../../../middlewares/check-jwt";
import { checkIsAdmin, checkRoles } from "../../../middlewares/check-roles";
import { getAgentsAssignments } from "./handlers/get-agents-assignments";
import { getAgentsStats } from "./handlers/get-agents-stats";
import { getAgentsReports } from "./handlers/get-agents-reports";
import { getAgentsVerificationRequestReport } from "./handlers/get-agents-verification-request-report";
import { getAgentAssignment } from "./handlers/get-agent-assignment";
import { startVerification } from "./handlers/start-verification";
import { getAgentAssignmentChecklist } from "./handlers/get-agent-assignment-checklist";
import { updateAgentAssignmentChecklistItem } from "./handlers/update-agent-checklist-item";
import { updateAgentAssignmentNotes } from "./handlers/update-agent-assignment-notes";
import { submitAgentReport } from "./handlers/submit-agent-report";
import { getAgentAssignmentReportHandler } from "./handlers/get-agent-assignment-report";
import { assignVerificationRequestAgent } from "./handlers/assign-verification-request-agent";
import { getAgentReport } from "./handlers/get-agent-report";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const adminOrAgent = checkRoles([ROLE.ADMIN, ROLE.AGENT]);

/**
 * @swagger
 * /api/{version}/admin/verification-requests/{id}/assign-agent:
 *   post:
 *     tags: [Admin Verification]
 *     summary: Assign an agent to a paid verification request
 *     description: >
 *       Only requests in SUBMITTED status (paid and awaiting an agent) can be assigned.
 *       The request moves to IN_PROGRESS and the client and agent are notified.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Verification request ID
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentId]
 *             properties:
 *               agentId: { type: string, description: Verification agent ID }
 *     responses:
 *       201: { description: Agent assigned }
 *       400: { description: Missing agentId or the agent is inactive }
 *       401: { description: Missing or invalid authentication token }
 *       403: { description: Admin access required }
 *       404: { description: Verification request or agent not found }
 *       409: { description: Request already has an agent or is not awaiting assignment }
 */
router.post(
  "/verification-requests/:id/assign-agent",
  checkJwt,
  checkIsAdmin,
  assignVerificationRequestAgent,
);

/**
 * @swagger
 * /api/{version}/admin/verification/agent-assignments/{id}/start:
 *   post:
 *     tags: [Admin Verification]
 *     summary: Start an agent verification assignment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Accepted assignment with initialized checklist }
 *       401: { description: Missing or invalid authentication token }
 *       404: { description: Assignment not found }
 */
router.post("/verification/agent-assignments/:id/start", checkJwt, adminOrAgent, startVerification);

/**
 * @swagger
 * /api/{version}/admin/verification/agent-assignments/{id}/report:
 *   post:
 *     tags: [Admin Verification]
 *     summary: Submit an agent verification report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Verification report submitted }
 *       401: { description: Missing or invalid authentication token }
 *       404: { description: Assignment not found }
 *       409: { description: Checklist is incomplete }
 */
router.post(
  "/verification/agent-assignments/:id/report",
  checkJwt,
  adminOrAgent,
  submitAgentReport,
);

/**
 * @swagger
 * /api/{version}/admin/verification/agent-assignments/{id}/report:
 *   get:
 *     tags: [Admin Verification]
 *     summary: Get an agent assignment verification report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Verification report details and checklist photos }
 *       401: { description: Missing or invalid authentication token }
 *       404: { description: Assignment report not found }
 */
router.get(
  "/verification/agent-assignments/:id/report",
  checkJwt,
  adminOrAgent,
  getAgentAssignmentReportHandler,
);

/**
 * @swagger
 * /api/{version}/admin/verification/agent-assignments/{id}/checklist:
 *   get:
 *     tags: [Admin Verification]
 *     summary: Get an agent assignment checklist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Checklist, client documents, client details, and progress }
 *       401: { description: Missing or invalid authentication token }
 *       404: { description: Assignment not found }
 */
router.get(
  "/verification/agent-assignments/:id/checklist",
  checkJwt,
  adminOrAgent,
  getAgentAssignmentChecklist,
);

/**
 * @swagger
 * /api/{version}/admin/verification/agent-assignments/{id}/checklist/{itemId}:
 *   patch:
 *     tags: [Admin Verification]
 *     summary: Update a checklist item and optionally attach media
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [PENDING, COMPLETE] }
 *               media: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       200: { description: Updated checklist item }
 *       400: { description: Invalid checklist status }
 *       401: { description: Missing or invalid authentication token }
 *       404: { description: Checklist item not found }
 */
router.patch(
  "/verification/agent-assignments/:id/checklist/:itemId",
  checkJwt,
  adminOrAgent,
  upload.array("media"),
  updateAgentAssignmentChecklistItem,
);

/**
 * @swagger
 * /api/{version}/admin/verification/agent-assignments-notes/{id}:
 *   patch:
 *     tags: [Admin Verification]
 *     summary: Save agent assignment notes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               additionalNotes: { type: string }
 *     responses:
 *       200: { description: Updated agent assignment notes }
 *       400: { description: Invalid notes payload }
 *       401: { description: Missing or invalid authentication token }
 *       404: { description: Assignment not found }
 */
router.patch(
  "/verification/agent-assignments-notes/:id",
  checkJwt,
  adminOrAgent,
  updateAgentAssignmentNotes,
);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/assignments:
 *   get:
 *     tags: [Admin Verification]
 *     summary: List agent assignments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ALL, IN_PROGRESS], default: ALL }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 5 }
 *     responses:
 *       200:
 *         description: Agent assignments with request and checklist context
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Insufficient permissions
 */
router.get("/verification/agents/assignments", checkJwt, adminOrAgent, getAgentsAssignments);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/assignments/{id}:
 *   get:
 *     tags: [Admin Verification]
 *     summary: View an assigned verification request
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Assignment details with client and payment information }
 *       401: { description: Missing or invalid authentication token }
 *       404: { description: Assignment not found }
 */
router.get("/verification/agents/assignments/:id", checkJwt, adminOrAgent, getAgentAssignment);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/stats:
 *   get:
 *     tags: [Admin Verification]
 *     summary: Get agent assignment statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent and assignment statistics
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Insufficient permissions
 */
router.get("/verification/agents/stats", checkJwt, adminOrAgent, getAgentsStats);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/reports:
 *   get:
 *     tags: [Admin Verification]
 *     summary: List reports submitted by the authenticated agent
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: reviewStatus
 *         schema: { type: string, enum: [ALL, APPROVED, REVISION_REQUESTED], default: ALL }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Agent report cards }
 *       401: { description: Missing or invalid authentication token }
 *       403: { description: Insufficient permissions }
 */
router.get("/verification/agents/reports", checkJwt, adminOrAgent, getAgentsReports);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/reports/{id}:
 *   get:
 *     tags: [Admin Verification]
 *     summary: Get one of the authenticated agent's reports by report ID
 *     description: >
 *       Use this to open finished work. Unlike /agent-assignments/{id}/report it keeps
 *       working after a recurring assignment is released at the end of its period.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Report ID (from the agent's reports list)
 *         schema: { type: string }
 *     responses:
 *       200: { description: Report details, client, checklist photos and notes }
 *       401: { description: Missing or invalid authentication token }
 *       403: { description: Insufficient permissions }
 *       404: { description: Report not found, or submitted by another agent }
 */
router.get("/verification/agents/reports/:id", checkJwt, adminOrAgent, getAgentReport);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/verification-requests/{id}/report:
 *   get:
 *     tags: [Admin Verification]
 *     summary: View a report for an assigned verification request
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Full verification report }
 *       401: { description: Missing or invalid authentication token }
 *       403: { description: Insufficient permissions }
 *       404: { description: Verification report not found }
 */
router.get(
  "/verification/agents/verification-requests/:id/report",
  checkJwt,
  adminOrAgent,
  getAgentsVerificationRequestReport,
);

export default router;
