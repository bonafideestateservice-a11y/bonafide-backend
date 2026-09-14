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
 *     summary: Request a password reset OTP for an admin
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
 * /api/{version}/admin/verify-otp:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Verify a password reset OTP
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
 *             required: [otp]
 *             properties:
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP is valid
 *       400:
 *         description: Invalid or expired OTP
 */
router.post("/verify-otp", AuthenticationController.verifyOtp);

/**
 * @swagger
 * /api/{version}/admin/reset-password:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Reset a password using a valid OTP
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
 *             required: [email, otp, password]
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid/expired OTP or missing fields
 */
router.post("/reset-password", AuthenticationController.resetPassword);

export default router;