import { Router } from "express";

import { checkJwt } from "../../middlewares/check-jwt";
import { checkIsAdmin } from "../../middlewares/check-roles";
import { listUsersHandler } from "./handlers/users/list-users-v1";

const router = Router();

/**
 * @swagger
 * /api/{version}/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of users
 */
router.get("/users", checkJwt, checkIsAdmin, listUsersHandler);

export default router;