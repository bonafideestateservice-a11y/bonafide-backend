import { Router } from "express";
import { ROLE } from "@prisma/client";
import { checkJwt } from "../../../middlewares/check-jwt";
import { checkRoles } from "../../../middlewares/check-roles";
import * as AuthenticationController from "./handlers";

const router = Router();

const adminOrAgent = checkRoles([ROLE.ADMIN, ROLE.AGENT]);

/**
 * @swagger
 * /api/{version}/admin/login:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Authenticate an admin or agent
 *     security: []
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
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", AuthenticationController.login);

/**
 * @swagger
 * /api/{version}/admin/change-password:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Change the authenticated admin's password
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
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post("/change-password", checkJwt, adminOrAgent, AuthenticationController.changePassword);

/**
 * @swagger
 * /api/{version}/admin/forgot-password:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Request a password reset token for an admin
 *     security: []
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
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reset token generated
 */
router.post("/forgot-password", AuthenticationController.forgotPassword);

/**
 * @swagger
 * /api/{version}/admin/reset-password/{token}:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Reset a password using a valid reset token
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 */
router.post("/reset-password/:token", AuthenticationController.resetPassword);

export default router;