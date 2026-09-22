import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { checkIsAdmin } from "../../../middlewares/check-roles";
import { getDashboardStatsHandler } from "./handlers/get-dashboard-stats";

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

export default router;
