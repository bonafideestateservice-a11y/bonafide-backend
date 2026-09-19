import { Router } from "express";
import { ROLE } from "@prisma/client";
import { checkJwt } from "../../../middlewares/check-jwt";
import { checkRoles } from "../../../middlewares/check-roles";
import { getAgentsAssignments } from "./get-agents-assignments";
import { getAgentsStats } from "./get-agents-stats";

const router = Router();
const adminOrAgent = checkRoles([ROLE.ADMIN, ROLE.AGENT]);

/**
 * @swagger
 * /api/{version}/admin/verification/agents/assignments:
 *   get:
 *     tags: [Admin Verification]
 *     summary: List agent assignments
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent assignments with request and checklist context
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/verification/agents/assignments",
  checkJwt,
  adminOrAgent,
  getAgentsAssignments,
);

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
router.get(
  "/verification/agents/stats",
  checkJwt,
  adminOrAgent,
  getAgentsStats,
);

export default router;
