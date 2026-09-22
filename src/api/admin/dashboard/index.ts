import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { checkIsAdmin } from "../../../middlewares/check-roles";
import { getAllPropertiesHandler } from "./handlers/get-all-properties";
import { getDashboardStatsHandler } from "./handlers/get-dashboard-stats";
import { getVerificationRequestsHandler } from "./handlers/get-verification-requests";
import { publishPropertyHandler } from "./handlers/publish-property";

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

/**
 * @swagger
 * /api/{version}/admin/properties:
 *   get:
 *     tags: [Properties]
 *     summary: List properties
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [all, published, unpublished], default: all }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [RESIDENTIAL, COMMERCIAL, LAND] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 12 }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [createdAt, price], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200: { description: Paginated properties }
 *       401: { description: Missing or invalid authentication token }
 *       403: { description: Insufficient permissions }
 */
router.get("/properties", checkJwt, checkIsAdmin, getAllPropertiesHandler);

/**
 * @swagger
 * /api/{version}/admin/properties/{id}/publish:
 *   patch:
 *     tags: [Properties]
 *     summary: Toggle a property's publication state
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Toggled publication state }
 *       404: { description: Property not found }
 */
router.patch("/properties/:id/publish", checkJwt, checkIsAdmin, publishPropertyHandler);

export default router;
