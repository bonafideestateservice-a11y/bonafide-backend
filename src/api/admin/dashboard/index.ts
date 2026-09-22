import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { checkIsAdmin } from "../../../middlewares/check-roles";
import { getDashboardStatsHandler } from "./handlers/get-dashboard-stats";
import { getVerificationRequestsHandler } from "./handlers/get-verification-requests";

const router = Router();

/**
 * @swagger
 * /api/{version}/admin/dashboard/stats:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: Get dashboard statistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *       401: { description: Missing or invalid authentication token }
 *       403: { description: Insufficient permissions }
 *       500: { description: Internal server error }
 */
router.get("/dashboard/stats", checkJwt, checkIsAdmin, getDashboardStatsHandler);

/**
 * @swagger
 * /api/{version}/admin/verification-requests:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: List verification requests for the dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [all, pending, assigned, in_progress, completed], default: all }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: agentId
 *         schema: { type: string }
 *       - in: query
 *         name: propertyType
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [createdAt, status], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200: { description: Paginated verification requests }
 *       400: { description: Invalid query parameters }
 *       401: { description: Missing or invalid authentication token }
 *       403: { description: Insufficient permissions }
 *       500: { description: Internal server error }
 */
router.get("/verification-requests", checkJwt, checkIsAdmin, getVerificationRequestsHandler);

export default router;
