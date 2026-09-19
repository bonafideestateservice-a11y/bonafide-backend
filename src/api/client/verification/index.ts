import { Router } from "express";
import multer from "multer";
import { checkJwt } from "../../../middlewares/check-jwt";
import { getVerificationReportSummary } from "./handlers/get-verification-report-summary";
import { getVerificationRequests } from "./handlers/get-verification-requests";
import { getVerificationTypes } from "./handlers/get-verification-types";
import { postVerificationRequest } from "./handlers/post-verification-request";
import { postVerificationDocuments } from "./handlers/post-verification-documents";
import { patchVerificationRequest } from "./handlers/patch-verification-request";
import { patchVerificationRequestPlan } from "./handlers/patch-verification-request-plan";
import { getVerificationTypesPlan } from "./handlers/get-verification-types-plan";
import { getVerificationRequest } from "./handlers/get-verification-request";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @swagger
 * /api/{version}/client/services/verification/verification-types:
 *   get:
 *     tags: [Verification]
 *     summary: Get the available verification categories
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Available verification categories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 required: [id, name, slug, description, icon]
 *                 properties:
 *                   id: { type: string }
 *                   name: { type: string }
 *                   slug: { type: string }
 *                   description: { type: string }
 *                   icon: { type: string }
 *       500:
 *         description: Internal server error
 */
router.get("/services/verification/verification-types", getVerificationTypes);

/**
 * @swagger
 * /api/{version}/client/verification-types/{slug}/plans:
 *   get:
 *     tags: [Verification]
 *     summary: Get the plans for a verification type
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Available verification plans
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 required: [id, frequency, name, description, priceInCents, currency]
 *                 properties:
 *                   id: { type: string }
 *                   frequency: { type: string, enum: [ONE_TIME, MONTHLY, QUARTERLY] }
 *                   name: { type: string }
 *                   description: { type: string }
 *                   priceInCents: { type: integer }
 *                   currency: { type: string }
 *       500:
 *         description: Internal server error
 */
router.get("/verification-types/:slug/plans", getVerificationTypesPlan);

/**
 * @swagger
 * /api/{version}/client/verification-requests:
 *   post:
 *     tags: [Verification]
 *     summary: Create a draft property verification request
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [verificationTypeId, details]
 *             properties:
 *               verificationTypeId: { type: string }
 *               details:
 *                 type: object
 *                 required: [propertyType, propertyAddress]
 *                 properties:
 *                   propertyName: { type: string }
 *                   propertyType: { type: string, example: COMPLETED_BUILDING }
 *                   propertyAddress: { type: string }
 *               additionalNote: { type: string }
 *     responses:
 *       201:
 *         description: Draft verification request created
 *       400:
 *         description: Invalid or missing request fields
 *       401:
 *         description: Missing or invalid authentication token
 *       500:
 *         description: Internal server error
 */
router.post("/verification-requests", checkJwt, postVerificationRequest);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}:
 *   get:
 *     tags: [Verification]
 *     summary: Get a verification request payment summary
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
 *       200:
 *         description: Verification request summary before payment method selection
 *       401:
 *         description: Missing or invalid authentication token
 *       404:
 *         description: Verification request or plan not found
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/{version}/client/verification-requests/reports-summary:
 *   get:
 *     tags: [Verification]
 *     summary: Get the authenticated user's unviewed verification report count
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Number of reports that have not been viewed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VerificationReportSummary'
 *       401:
 *         description: Missing or invalid authentication token
 *       500:
 *         description: Internal server error
 */
router.get("/verification-requests/reports-summary", checkJwt, getVerificationReportSummary);

router.get("/verification-requests/:id", checkJwt, getVerificationRequest);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}:
 *   patch:
 *     tags: [Verification]
 *     summary: Update a verification request
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
 *             minProperties: 1
 *             properties:
 *               details:
 *                 type: object
 *                 properties:
 *                   propertyName: { type: string }
 *                   propertyType: { type: string, example: COMPLETED_BUILDING }
 *                   propertyAddress: { type: string }
 *               additionalNote: { type: string }
 *     responses:
 *       200:
 *         description: Updated verification request
 *       400:
 *         description: Invalid update fields
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Verification request belongs to another user
 *       404:
 *         description: Verification request not found
 *       500:
 *         description: Internal server error
 */
router.patch("/verification-requests/:id", checkJwt, patchVerificationRequest);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/plan:
 *   patch:
 *     tags: [Verification]
 *     summary: Select a plan for a verification request
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
 *             required: [verificationPlanId]
 *             properties:
 *               verificationPlanId: { type: string }
 *     responses:
 *       200:
 *         description: Selected verification plan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [id, status, verificationPlanId, plan]
 *               properties:
 *                 id: { type: string }
 *                 status: { type: string, example: DRAFT }
 *                 verificationPlanId: { type: string }
 *                 plan:
 *                   type: object
 *                   required: [frequency, name, priceInCents, currency]
 *                   properties:
 *                     frequency: { type: string }
 *                     name: { type: string }
 *                     priceInCents: { type: integer }
 *                     currency: { type: string }
 *       400:
 *         description: Invalid or incompatible verification plan
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Verification request belongs to another user
 *       404:
 *         description: Verification request or plan not found
 *       500:
 *         description: Internal server error
 */
router.patch("/verification-requests/:id/plan", checkJwt, patchVerificationRequestPlan);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/documents:
 *   post:
 *     tags: [Verification]
 *     summary: Upload a document for a verification request
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Uploaded verification document
 *       400:
 *         description: A file is missing or invalid
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Verification request belongs to another user
 *       404:
 *         description: Verification request not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/verification-requests/:id/documents",
  checkJwt,
  upload.single("file"),
  postVerificationDocuments,
);

/**
 * @swagger
 * /api/{version}/client/verification-requests:
 *   get:
 *     tags: [Verification]
 *     summary: Get the authenticated user's recent verification requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Number of requests to return, from 1 to 50
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 5 }
 *     responses:
 *       200:
 *         description: Verification requests sorted by most recently updated
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/VerificationRequestSummary'
 *       400:
 *         description: Invalid limit
 *       401:
 *         description: Missing or invalid authentication token
 *       500:
 *         description: Internal server error
 */
router.get("/verification-requests", checkJwt, getVerificationRequests);

/**
 * @swagger
 * /api/{version}/client/verification-requests/reports-summary:
 *   get:
 *     tags: [Verification]
 *     summary: Get the authenticated user's unviewed verification report count
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Number of reports that have not been viewed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VerificationReportSummary'
 *       401:
 *         description: Missing or invalid authentication token
 *       500:
 *         description: Internal server error
 */
export default router;
