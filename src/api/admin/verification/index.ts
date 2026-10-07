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
 * components:
 *   schemas:
 *     AdminVerificationAgentAssignmentStatus:
 *       type: string
 *       enum: [ASSIGNED, ACCEPTED, INSPECTION_SCHEDULED, INSPECTION_COMPLETE, REPORT_SUBMITTED]
 *       example: ACCEPTED
 *     AdminVerificationStatus:
 *       type: string
 *       enum: [DRAFT, PENDING_PAYMENT, PAYMENT_FAILED, SUBMITTED, IN_PROGRESS, AWAITING_RENEWAL, COMPLETED, CANCELLED]
 *       example: IN_PROGRESS
 *     AdminVerificationReportReviewStatus:
 *       type: string
 *       enum: [PENDING, APPROVED, REVISION_REQUESTED]
 *       example: PENDING
 *     AdminVerificationPaymentStatus:
 *       type: string
 *       enum: [PENDING, SUCCESS, FAILED]
 *       example: SUCCESS
 *     AdminVerificationChecklistItemStatus:
 *       type: string
 *       enum: [PENDING, COMPLETE]
 *       example: COMPLETE
 *     AdminVerificationTypeName:
 *       type: object
 *       description: The verification type, reduced to its name.
 *       required: [name]
 *       properties:
 *         name: { type: string, example: Land Verification }
 *     AdminVerificationClientName:
 *       type: object
 *       description: >
 *         The client's full name split on whitespace; the first word is firstName and the
 *         rest is lastName (empty string for single-word names).
 *       required: [firstName, lastName]
 *       properties:
 *         firstName: { type: string, example: Ada }
 *         lastName: { type: string, example: Okafor }
 *     AdminVerificationClientContact:
 *       type: object
 *       required: [firstName, lastName, phone, email]
 *       properties:
 *         firstName: { type: string, example: Ada }
 *         lastName: { type: string, example: Okafor }
 *         phone: { type: string, description: Empty string when the client has no phone., example: "+2348012345678" }
 *         email: { type: string, format: email, example: ada@example.com }
 *     AdminVerificationAssignAgentRequest:
 *       type: object
 *       required: [agentId]
 *       properties:
 *         agentId:
 *           type: string
 *           minLength: 1
 *           description: VerificationAgent ID (not the agent's user ID). Surrounding whitespace is trimmed.
 *           example: cm9agent0001
 *     AdminVerificationAssignAgentResponse:
 *       type: object
 *       required: [id, verificationRequestId, status, agent, createdAt]
 *       properties:
 *         id: { type: string, description: The new agent assignment ID., example: cm9assign0001 }
 *         verificationRequestId: { type: string, example: cm9request0001 }
 *         status:
 *           allOf:
 *             - $ref: '#/components/schemas/AdminVerificationAgentAssignmentStatus'
 *           description: Always ASSIGNED for a new assignment.
 *           example: ASSIGNED
 *         agent:
 *           type: object
 *           required: [id, name]
 *           properties:
 *             id: { type: string, example: cm9agent0001 }
 *             name: { type: string, example: Tunde Bakare }
 *         createdAt: { type: string, format: date-time, example: "2026-10-07T09:30:00.000Z" }
 *     AdminVerificationStartedAssignment:
 *       type: object
 *       required: [id, status, checklist]
 *       properties:
 *         id: { type: string, example: cm9assign0001 }
 *         status:
 *           allOf:
 *             - $ref: '#/components/schemas/AdminVerificationAgentAssignmentStatus'
 *           description: ACCEPTED if the assignment was ASSIGNED; otherwise its current status is kept.
 *         checklist:
 *           type: array
 *           items:
 *             type: object
 *             required: [id, label, status, requiresMedia]
 *             properties:
 *               id: { type: string, example: cm9item0001 }
 *               label: { type: string, example: Photograph the property frontage }
 *               status:
 *                 type: string
 *                 enum: [PENDING]
 *                 description: Always PENDING in this response, even for items already completed.
 *               requiresMedia:
 *                 type: boolean
 *                 description: From the checklist template item with the same sortOrder; false if none matches.
 *                 example: true
 *     AdminVerificationReportSubmitted:
 *       type: object
 *       required: [id, reviewStatus, generatedAt]
 *       properties:
 *         id: { type: string, description: Verification report ID., example: cm9report0001 }
 *         reviewStatus: { $ref: '#/components/schemas/AdminVerificationReportReviewStatus' }
 *         generatedAt: { type: string, format: date-time, example: "2026-10-07T12:00:00.000Z" }
 *     AdminVerificationIncompleteChecklist:
 *       type: object
 *       description: Written directly by the handler (not the ErrorResponse shape).
 *       required: [error, progressPercent, remainingItems]
 *       properties:
 *         error: { type: string, enum: [INCOMPLETE_CHECKLIST] }
 *         progressPercent: { type: integer, minimum: 0, maximum: 100, example: 60 }
 *         remainingItems:
 *           type: array
 *           description: Labels of checklist items that are not COMPLETE.
 *           items: { type: string }
 *           example: [Photograph the property frontage, Confirm survey plan number]
 *     AdminVerificationReportPhoto:
 *       type: object
 *       required: [url, label]
 *       properties:
 *         url: { type: string, format: uri, example: "https://res.cloudinary.com/demo/image/upload/frontage.jpg" }
 *         label: { type: string, description: Label of the checklist item the media belongs to., example: Photograph the property frontage }
 *     AdminVerificationAssignmentReport:
 *       type: object
 *       required: [client, address, photos, additionalNotes, reportUrl]
 *       properties:
 *         client: { $ref: '#/components/schemas/AdminVerificationClientContact' }
 *         address:
 *           type: string
 *           description: The request's details.propertyAddress only (empty string when absent).
 *           example: 12 Admiralty Way, Lekki, Lagos
 *         photos:
 *           type: array
 *           description: Every media file of every checklist item, ordered by checklist item sortOrder.
 *           items: { $ref: '#/components/schemas/AdminVerificationReportPhoto' }
 *         additionalNotes: { type: string, description: Empty string when no notes were saved., example: Owner was present during inspection. }
 *         reportUrl: { type: string, format: uri, nullable: true, example: null }
 *     AdminVerificationReportDetail:
 *       type: object
 *       required: [id, verificationRequestId, generatedAt, reviewStatus, client, address, photos, additionalNotes, reportUrl]
 *       properties:
 *         id: { type: string, example: cm9report0001 }
 *         verificationRequestId: { type: string, example: cm9request0001 }
 *         generatedAt: { type: string, format: date-time, nullable: true, example: "2026-10-07T12:00:00.000Z" }
 *         reviewStatus: { $ref: '#/components/schemas/AdminVerificationReportReviewStatus' }
 *         client: { $ref: '#/components/schemas/AdminVerificationClientContact' }
 *         address:
 *           type: string
 *           description: The request's details.propertyAddress only (empty string when absent).
 *           example: 12 Admiralty Way, Lekki, Lagos
 *         photos:
 *           type: array
 *           description: Media of the checklist items saved with this report, ordered by sortOrder.
 *           items: { $ref: '#/components/schemas/AdminVerificationReportPhoto' }
 *         additionalNotes: { type: string, description: Notes copied from the assignment at submission (empty string if none)., example: Owner was present during inspection. }
 *         reportUrl: { type: string, format: uri, nullable: true, example: null }
 *     AdminVerificationChecklistItem:
 *       type: object
 *       required: [id, label, status, media]
 *       properties:
 *         id: { type: string, example: cm9item0001 }
 *         label: { type: string, example: Photograph the property frontage }
 *         status: { $ref: '#/components/schemas/AdminVerificationChecklistItemStatus' }
 *         media:
 *           type: array
 *           items:
 *             type: object
 *             required: [url]
 *             properties:
 *               url: { type: string, format: uri, example: "https://res.cloudinary.com/demo/image/upload/frontage.jpg" }
 *     AdminVerificationAssignmentChecklist:
 *       type: object
 *       required: [checklistItems, clientDocuments, client, additionalNotes, progressPercent, payment]
 *       properties:
 *         checklistItems:
 *           type: array
 *           description: Ordered by sortOrder. Empty until the assignment is started.
 *           items: { $ref: '#/components/schemas/AdminVerificationChecklistItem' }
 *         clientDocuments:
 *           type: array
 *           description: Documents the client uploaded with the request (not checklist or report media), oldest first.
 *           items:
 *             type: object
 *             required: [id, fileName, fileSizeBytes, url]
 *             properties:
 *               id: { type: string, example: cm9doc0001 }
 *               fileName: { type: string, example: survey-plan.pdf }
 *               fileSizeBytes: { type: integer, example: 482113 }
 *               url: { type: string, format: uri, example: "https://res.cloudinary.com/demo/raw/upload/survey-plan.pdf" }
 *         client: { $ref: '#/components/schemas/AdminVerificationClientContact' }
 *         additionalNotes: { type: string, nullable: true, example: Owner was present during inspection. }
 *         progressPercent:
 *           type: integer
 *           minimum: 0
 *           maximum: 100
 *           description: Recomputed from the checklist (0 when there are no items).
 *           example: 50
 *         payment:
 *           type: object
 *           description: >
 *             The payment for this assignment's period, falling back to the request's latest
 *             transaction, or { status PENDING, amountInCents 0 } when there is none.
 *           required: [status, amountInCents]
 *           properties:
 *             status: { $ref: '#/components/schemas/AdminVerificationPaymentStatus' }
 *             amountInCents: { type: integer, example: 2500000 }
 *     AdminVerificationUpdateChecklistItemRequest:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [PENDING, COMPLETE]
 *           default: PENDING
 *           description: >
 *             New item status. Defaults to PENDING when omitted, so a media-only update
 *             resets a COMPLETE item to PENDING.
 *         media:
 *           type: array
 *           description: >
 *             Files to upload to Cloudinary and attach to the item (appended to existing media).
 *             No count, size or type limit is enforced; application/pdf is uploaded as a raw
 *             file and everything else as an image (non-image files are rejected by Cloudinary,
 *             which surfaces as a 500).
 *           items: { type: string, format: binary }
 *     AdminVerificationUpdateNotesRequest:
 *       type: object
 *       required: [additionalNotes]
 *       properties:
 *         additionalNotes:
 *           type: string
 *           description: Replaces the assignment's notes. An empty string is allowed.
 *           example: Owner was present during inspection.
 *     AdminVerificationUpdateNotesResponse:
 *       type: object
 *       required: [id, additionalNotes]
 *       properties:
 *         id: { type: string, description: The assignment ID from the path., example: cm9assign0001 }
 *         additionalNotes: { type: string, example: Owner was present during inspection. }
 *     AdminVerificationAssignmentSummary:
 *       type: object
 *       required: [id, verificationType, client, address, status, progressPercent, scheduledAt]
 *       properties:
 *         id: { type: string, description: Agent assignment ID., example: cm9assign0001 }
 *         verificationType: { $ref: '#/components/schemas/AdminVerificationTypeName' }
 *         client: { $ref: '#/components/schemas/AdminVerificationClientName' }
 *         address:
 *           type: string
 *           description: details.propertyAddress, else constructionAddress, else businessAddress, else empty string.
 *           example: 12 Admiralty Way, Lekki, Lagos
 *         status: { $ref: '#/components/schemas/AdminVerificationAgentAssignmentStatus' }
 *         progressPercent: { type: integer, nullable: true, minimum: 0, maximum: 100, description: Null until the assignment is started., example: 40 }
 *         scheduledAt: { type: string, format: date-time, nullable: true, example: null }
 *     AdminVerificationAssignmentDetail:
 *       type: object
 *       required: [id, status, verificationType, address, client, payment, scheduledAt]
 *       properties:
 *         id: { type: string, example: cm9assign0001 }
 *         status: { $ref: '#/components/schemas/AdminVerificationAgentAssignmentStatus' }
 *         verificationType: { $ref: '#/components/schemas/AdminVerificationTypeName' }
 *         address:
 *           type: string
 *           description: details.propertyAddress, else constructionAddress, else businessAddress, else empty string.
 *           example: 12 Admiralty Way, Lekki, Lagos
 *         client: { $ref: '#/components/schemas/AdminVerificationClientContact' }
 *         payment:
 *           type: object
 *           description: >
 *             The payment for this assignment's period, falling back to the request's latest
 *             transaction, or { status PENDING, amountInCents 0, currency USD } when there is none.
 *           required: [status, amountInCents, currency]
 *           properties:
 *             status: { $ref: '#/components/schemas/AdminVerificationPaymentStatus' }
 *             amountInCents: { type: integer, example: 2500000 }
 *             currency: { type: string, example: NGN }
 *         scheduledAt: { type: string, format: date-time, nullable: true, example: null }
 *     AdminVerificationAgentStats:
 *       type: object
 *       required: [activeCount, completedCount, avgRating]
 *       properties:
 *         activeCount: { type: integer, description: "Assignments in ASSIGNED, ACCEPTED or INSPECTION_SCHEDULED.", example: 3 }
 *         completedCount: { type: integer, description: Reports submitted by the agent (all review statuses)., example: 12 }
 *         avgRating: { type: number, description: Average report rating rounded to 1 decimal; 0 when unrated., example: 4.6 }
 *     AdminVerificationReportSummary:
 *       type: object
 *       required: [id, verificationType, client, district, generatedAt, reviewStatus, rating, reportUrl]
 *       properties:
 *         id: { type: string, description: Verification report ID., example: cm9report0001 }
 *         verificationType: { $ref: '#/components/schemas/AdminVerificationTypeName' }
 *         client: { $ref: '#/components/schemas/AdminVerificationClientName' }
 *         district:
 *           type: string
 *           description: The full address (propertyAddress, else constructionAddress, else businessAddress, else empty string).
 *           example: 12 Admiralty Way, Lekki, Lagos
 *         generatedAt:
 *           type: string
 *           description: ISO 8601 date-time, or an empty string when the report has no generatedAt.
 *           example: "2026-10-07T12:00:00.000Z"
 *         reviewStatus: { $ref: '#/components/schemas/AdminVerificationReportReviewStatus' }
 *         rating: { type: number, nullable: true, example: 4.5 }
 *         reportUrl: { type: string, description: Empty string when no report file exists., example: "" }
 *     AdminVerificationDocument:
 *       type: object
 *       required: [id, verificationRequestId, verificationReportId, checklistItemId, url, fileName, fileType, fileSizeBytes, createdAt]
 *       properties:
 *         id: { type: string, example: cm9doc0001 }
 *         verificationRequestId: { type: string, example: cm9request0001 }
 *         verificationReportId: { type: string, nullable: true, example: cm9report0001 }
 *         checklistItemId: { type: string, nullable: true, example: null }
 *         url: { type: string, format: uri, example: "https://res.cloudinary.com/demo/raw/upload/report.pdf" }
 *         fileName: { type: string, example: report.pdf }
 *         fileType: { type: string, example: application/pdf }
 *         fileSizeBytes: { type: integer, example: 482113 }
 *         createdAt: { type: string, format: date-time }
 *     AdminVerificationRequestReport:
 *       type: object
 *       description: >
 *         The raw VerificationReport record with its relations, as Prisma returns it.
 *       required: [id, verificationRequestId, transactionId, submittedByAgentId, summary, findings, reportUrl, viewedAt, generatedAt, reviewStatus, rating, revisionNote, additionalNotes, createdAt, updatedAt, media, verificationRequest, agent]
 *       properties:
 *         id: { type: string, example: cm9report0001 }
 *         verificationRequestId: { type: string, example: cm9request0001 }
 *         transactionId: { type: string, nullable: true, description: The payment (period) this report covers., example: cm9txn0001 }
 *         submittedByAgentId: { type: string, example: cm9agent0001 }
 *         summary: { type: string, nullable: true, example: null }
 *         findings:
 *           description: Free-form JSON findings, or null when none were recorded.
 *           example: null
 *         reportUrl: { type: string, format: uri, nullable: true, example: null }
 *         viewedAt: { type: string, format: date-time, nullable: true, example: null }
 *         generatedAt: { type: string, format: date-time, nullable: true, example: "2026-10-07T12:00:00.000Z" }
 *         reviewStatus: { $ref: '#/components/schemas/AdminVerificationReportReviewStatus' }
 *         rating: { type: number, nullable: true, example: null }
 *         revisionNote: { type: string, nullable: true, example: null }
 *         additionalNotes: { type: string, nullable: true, example: Owner was present during inspection. }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *         media:
 *           type: array
 *           description: >
 *             Documents attached directly to the report (verificationReportId). Checklist
 *             photos are linked to checklist items instead, so they do not appear here.
 *           items: { $ref: '#/components/schemas/AdminVerificationDocument' }
 *         verificationRequest:
 *           type: object
 *           required: [id, userId, verificationTypeId, verificationPlanId, status, details, additionalNote, notifyOnInspectionStart, notifyOnReportReady, createdAt, updatedAt, verificationType, user]
 *           properties:
 *             id: { type: string, example: cm9request0001 }
 *             userId: { type: string, format: uuid }
 *             verificationTypeId: { type: string, example: cm9type0001 }
 *             verificationPlanId: { type: string, nullable: true, example: cm9plan0001 }
 *             status: { $ref: '#/components/schemas/AdminVerificationStatus' }
 *             details:
 *               type: object
 *               additionalProperties: true
 *               description: Type-specific request details (e.g. propertyAddress).
 *               example: { propertyAddress: "12 Admiralty Way, Lekki, Lagos" }
 *             additionalNote: { type: string, nullable: true, example: null }
 *             notifyOnInspectionStart: { type: boolean, example: true }
 *             notifyOnReportReady: { type: boolean, example: true }
 *             createdAt: { type: string, format: date-time }
 *             updatedAt: { type: string, format: date-time }
 *             verificationType:
 *               type: object
 *               required: [id, serviceId, name, slug, description, icon, createdAt, updatedAt]
 *               properties:
 *                 id: { type: string, example: cm9type0001 }
 *                 serviceId: { type: string, example: cm9service0001 }
 *                 name: { type: string, example: Land Verification }
 *                 slug: { type: string, example: land-verification }
 *                 description: { type: string, nullable: true }
 *                 icon: { type: string, nullable: true }
 *                 createdAt: { type: string, format: date-time }
 *                 updatedAt: { type: string, format: date-time }
 *             user:
 *               description: >
 *                 The full client User record. Because the query uses `include: { user: true }`,
 *                 this currently also contains the `password` hash field.
 *               allOf:
 *                 - $ref: '#/components/schemas/User'
 *                 - type: object
 *                   properties:
 *                     password: { type: string, nullable: true, description: Password hash (leaked by the current implementation). }
 *         agent:
 *           type: object
 *           required: [id, userId, name, phone, region, status, createdAt, updatedAt]
 *           properties:
 *             id: { type: string, example: cm9agent0001 }
 *             userId: { type: string, format: uuid }
 *             name: { type: string, example: Tunde Bakare }
 *             phone: { type: string, nullable: true, example: "+2348098765432" }
 *             region: { type: string, nullable: true, example: Lagos }
 *             status: { type: string, enum: [ACTIVE, INACTIVE] }
 *             createdAt: { type: string, format: date-time }
 *             updatedAt: { type: string, format: date-time }
 */

/**
 * @swagger
 * /api/{version}/admin/verification-requests/{id}/assign-agent:
 *   post:
 *     tags: [Admin Verification]
 *     summary: Assign an agent to a paid verification request (admin only)
 *     description: >
 *       Only requests in SUBMITTED status (paid and awaiting an agent) with a paid period that
 *       has no report yet can be assigned. In one transaction the request moves to IN_PROGRESS
 *       and an assignment (status ASSIGNED) is created for the oldest unreported paid period;
 *       the client and agent are then notified. Checks run in this order: request exists,
 *       request has no assignment, request is SUBMITTED, agent exists, agent is ACTIVE, paid period exists.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Verification request ID
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminVerificationAssignAgentRequest' }
 *     responses:
 *       201:
 *         description: Agent assigned; the request is now IN_PROGRESS.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationAssignAgentResponse' }
 *       400:
 *         description: "agentId is missing, not a string or blank (`agentId is required and must be a non-empty string.`), or the agent is not ACTIVE (`Verification agent is inactive.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller is not an ADMIN (`Insufficient permissions. Admin access required.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification request not found.` or `Verification agent not found.` (no VerificationAgent with that agentId)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: >
 *           The request already has an assignment (`Verification request already has an assigned agent.`),
 *           is not SUBMITTED (`Only paid verification requests awaiting an agent can be assigned (current status: X).`),
 *           or has no unreported paid period (`Verification request has no paid period awaiting an agent.`).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
 *     summary: Start (accept) one of the caller's agent assignments
 *     description: >
 *       Creates the assignment's checklist from the verification type's checklist template the
 *       first time it is called (and sets progressPercent to 0), and moves an ASSIGNED assignment
 *       to ACCEPTED, which notifies the client that the inspection has started. Calling it again
 *       is idempotent: the checklist is not recreated and other statuses are left unchanged.
 *       Only the caller's own assignments are found; callers without a VerificationAgent record
 *       (e.g. admins) get 404.
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Agent assignment ID
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The assignment with its checklist.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationStartedAssignment' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record) or `Assignment not found.` (no such assignment for this agent)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/verification/agent-assignments/:id/start", checkJwt, adminOrAgent, startVerification);

/**
 * @swagger
 * /api/{version}/admin/verification/agent-assignments/{id}/report:
 *   post:
 *     tags: [Admin Verification]
 *     summary: Submit the verification report for one of the caller's assignments
 *     description: >
 *       Requires every checklist item to be COMPLETE (an assignment with no checklist items,
 *       i.e. never started, passes this check). Creates a PENDING report for the assignment's
 *       paid period (or returns the existing one if already created), copies the assignment's
 *       notes and links its checklist items to the report, and notifies the client.
 *       One-time requests: the assignment becomes REPORT_SUBMITTED and the request COMPLETED
 *       (unless CANCELLED). Recurring plans: the assignment is deleted (so
 *       GET /verification/agent-assignments/{id}/report and the other assignment endpoints then
 *       return 404, while GET /verification/agents/reports/{reportId} keeps working) and the
 *       request moves to SUBMITTED (next period already paid), AWAITING_RENEWAL, or COMPLETED
 *       (subscription ended).
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Agent assignment ID
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Report submitted (or the existing report for this period re-confirmed).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationReportSubmitted' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record) or `Assignment not found.` (no such assignment for this agent, including a recurring assignment already deleted by an earlier submission)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Some checklist items are not COMPLETE. Note this body is not the ErrorResponse shape.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationIncompleteChecklist' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
 *     summary: Get the report view for one of the caller's assignments
 *     description: >
 *       Built from the assignment itself (its notes and checklist media), so it works before
 *       and after submission for one-time requests. For recurring plans the assignment is
 *       deleted on submission, after which this returns 404; use
 *       GET /verification/agents/reports/{reportId} instead. reportUrl comes from the report
 *       for the assignment's period, else the request's latest report, else null.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Agent assignment ID
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Report details and checklist photos.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationAssignmentReport' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record) or `Assignment report not found.` (no such assignment for this agent, e.g. a recurring assignment deleted after its report was submitted)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
 *     summary: Get the checklist, client documents and payment for one of the caller's assignments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Agent assignment ID
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The assignment checklist.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationAssignmentChecklist' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record) or `Assignment not found.` (no such assignment for this agent)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
 *     summary: Update a checklist item's status and optionally attach media
 *     description: >
 *       Uploads any `media` files to Cloudinary, sets the item's status, attaches the files to
 *       the item, and recomputes the assignment's progressPercent. Media files are uploaded
 *       before the item is looked up, so they are uploaded even when the request then 404s.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Agent assignment ID
 *         schema: { type: string }
 *       - in: path
 *         name: itemId
 *         required: true
 *         description: Checklist item ID (from the start or checklist endpoints)
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema: { $ref: '#/components/schemas/AdminVerificationUpdateChecklistItemRequest' }
 *           encoding:
 *             media:
 *               contentType: image/*, application/pdf
 *         application/json:
 *           schema:
 *             type: object
 *             description: Status-only update without files.
 *             properties:
 *               status: { type: string, enum: [PENDING, COMPLETE], default: PENDING }
 *     responses:
 *       200:
 *         description: The updated checklist item with all of its media.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationChecklistItem' }
 *       400:
 *         description: "status is present but not PENDING or COMPLETE (`Status must be PENDING or COMPLETE.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record) or `Checklist item not found.` (item does not belong to this assignment, or the assignment is not the caller's)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: >
 *           Cloudinary upload failure or database error (`Internal server error.`). A multer
 *           error, such as files sent under a field name other than `media`, also returns 500
 *           (`Internal server error`) via the global error handler.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
 *     summary: Save the additional notes on one of the caller's assignments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Agent assignment ID
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminVerificationUpdateNotesRequest' }
 *     responses:
 *       200:
 *         description: Notes saved; echoes the assignment ID and notes.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationUpdateNotesResponse' }
 *       400:
 *         description: "additionalNotes is missing or not a string (`additionalNotes must be a string.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record) or `Assignment not found.` (no such assignment for this agent)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
 *     summary: List the caller's agent assignments
 *     description: >
 *       Newest first. REPORT_SUBMITTED assignments are never returned.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: query
 *         name: status
 *         required: false
 *         description: >
 *           ALL returns ASSIGNED, ACCEPTED, INSPECTION_SCHEDULED and INSPECTION_COMPLETE;
 *           IN_PROGRESS returns ACCEPTED and INSPECTION_SCHEDULED.
 *         schema: { type: string, enum: [ALL, IN_PROGRESS], default: ALL }
 *       - in: query
 *         name: search
 *         required: false
 *         description: >
 *           Matches client full name or verification type name (case-insensitive), or the
 *           propertyAddress / constructionAddress / businessAddress detail (case-sensitive substring).
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Maximum number of assignments to return.
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 5 }
 *     responses:
 *       200:
 *         description: The caller's assignments.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/AdminVerificationAssignmentSummary' }
 *       400:
 *         description: "Invalid query: `Limit must be an integer between 1 and 50.`, `Status must be ALL or IN_PROGRESS.` or `Search must be a string.` (e.g. search repeated)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record, e.g. an admin)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification/agents/assignments", checkJwt, adminOrAgent, getAgentsAssignments);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/assignments/{id}:
 *   get:
 *     tags: [Admin Verification]
 *     summary: View one of the caller's assignments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Agent assignment ID
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Assignment detail with client contact and payment.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationAssignmentDetail' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record) or `Assignment not found.` (no such assignment for this agent)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification/agents/assignments/:id", checkJwt, adminOrAgent, getAgentAssignment);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/stats:
 *   get:
 *     tags: [Admin Verification]
 *     summary: Get the caller's agent statistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     responses:
 *       200:
 *         description: Active assignment count, submitted report count and average rating.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationAgentStats' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record, e.g. an admin)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification/agents/stats", checkJwt, adminOrAgent, getAgentsStats);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/reports:
 *   get:
 *     tags: [Admin Verification]
 *     summary: List reports submitted by the caller
 *     description: Ordered by generatedAt, newest first. Not paginated.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: query
 *         name: reviewStatus
 *         required: false
 *         description: Filter by review status. PENDING cannot be filtered on; ALL includes PENDING reports.
 *         schema: { type: string, enum: [ALL, APPROVED, REVISION_REQUESTED], default: ALL }
 *       - in: query
 *         name: search
 *         required: false
 *         description: >
 *           Matches client full name or verification type name (case-insensitive), or the
 *           propertyAddress / constructionAddress / businessAddress detail (case-sensitive substring).
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The caller's reports.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/AdminVerificationReportSummary' }
 *       400:
 *         description: "Invalid query: `Review status must be ALL, APPROVED, or REVISION_REQUESTED.` or `Search must be a string.`"
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record, e.g. an admin)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification/agents/reports", checkJwt, adminOrAgent, getAgentsReports);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/reports/{id}:
 *   get:
 *     tags: [Admin Verification]
 *     summary: Get one of the caller's reports by report ID
 *     description: >
 *       Built from the report's own saved notes and checklist, so unlike
 *       GET /verification/agent-assignments/{id}/report it keeps working after a recurring
 *       assignment is deleted on submission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Verification report ID (from the caller's reports list)
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Report detail.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationReportDetail' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record) or `Report not found.` (no such report submitted by this agent)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification/agents/reports/:id", checkJwt, adminOrAgent, getAgentReport);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/verification-requests/{id}/report:
 *   get:
 *     tags: [Admin Verification]
 *     summary: Get the caller's latest report for a verification request
 *     description: >
 *       Returns the most recent report (by generatedAt) that the caller submitted for the
 *       request, as the raw database record with its media, request (with verification type
 *       and full client user record) and agent.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Verification request ID
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The latest report for the request.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerificationRequestReport' }
 *       401:
 *         description: No token, or the token is invalid, expired, malformed or for a user that no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The caller's role is not ADMIN or AGENT (`Insufficient permissions.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "`Verification agent not found.` (caller has no VerificationAgent record) or `Verification report not found.` (the caller has not submitted a report for this request)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(
  "/verification/agents/verification-requests/:id/report",
  checkJwt,
  adminOrAgent,
  getAgentsVerificationRequestReport,
);

export default router;
