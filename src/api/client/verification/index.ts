import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { getVerificationReportSummary } from "./handlers/get-verification-report-summary";
import { getVerificationRequests } from "./handlers/get-verification-requests";
import { getVerificationTypes } from "./handlers/get-verification-types";

const router = Router();

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
