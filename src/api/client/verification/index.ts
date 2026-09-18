import { Router } from "express";
import multer from "multer";
import { checkJwt } from "../../../middlewares/check-jwt";
import { getVerificationReportSummary } from "./handlers/get-verification-report-summary";
import { getVerificationRequests } from "./handlers/get-verification-requests";
import { getVerificationTypes } from "./handlers/get-verification-types";
import { postVerificationRequest } from "./handlers/post-verification-request";
import { postVerificationDocuments } from "./handlers/post-verification-documents";

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
router.get(
  "/verification-requests/reports-summary",
  checkJwt,
  getVerificationReportSummary,
);

export default router;
