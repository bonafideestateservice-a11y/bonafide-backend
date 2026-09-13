import { Router } from "express";

import { checkJwt } from "../../middlewares/check-jwt";
import { getProfileHandler } from "./handlers/profile/get-profile-v1";

const router = Router();

/**
 * @swagger
 * /api/{version}/client/profile:
 *   get:
 *     tags: [Client]
 *     summary: Get the authenticated user's profile
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User profile
 */
router.get("/profile", checkJwt, getProfileHandler);

export default router;