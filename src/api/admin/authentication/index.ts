import { Router } from "express";
import { ROLE } from "@prisma/client";
import { checkJwt } from "../../../middlewares/check-jwt";
import { checkRoles } from "../../../middlewares/check-roles";
import * as AuthenticationController from "./handlers";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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
 * /api/{version}/admin/profile:
 *   get:
 *     tags: [Admin Authentication]
 *     summary: Get the authenticated admin profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Admin profile }
 *       401: { description: Missing or invalid authentication token }
 *       404: { description: Profile not found }
 */
router.get("/profile", checkJwt, adminOrAgent, AuthenticationController.getProfile);

/**
 * @swagger
 * /api/{version}/admin/profile:
 *   patch:
 *     tags: [Admin Authentication]
 *     summary: Update the authenticated admin profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string }
 *               phone: { type: string }
 *               location: { type: string }
 *               profilePhoto: { type: string, format: binary }
 *     responses:
 *       200: { description: Updated admin profile }
 *       400: { description: Invalid or empty profile update }
 *       401: { description: Missing or invalid authentication token }
 *       404: { description: Profile not found }
 */
router.patch(
  "/profile",
  checkJwt,
  adminOrAgent,
  upload.single("profilePhoto"),
  AuthenticationController.updateProfile,
);

/**
 * @swagger
 * /api/{version}/admin/profile/email:
 *   patch:
 *     tags: [Admin Authentication]
 *     summary: Change the authenticated admin email
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newEmail, password]
 *             properties:
 *               newEmail: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Updated admin profile }
 *       400: { description: Invalid email or password confirmation }
 *       401: { description: Incorrect password }
 *       409: { description: Email already in use }
 */
router.patch("/profile/email", checkJwt, adminOrAgent, AuthenticationController.changeEmail);

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

/**
 * @swagger
 * /api/{version}/admin/agents:
 *   get:
 *     tags: [Admin Authentication]
 *     summary: List verification agents
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Verification agents and assignment counts
 *       401:
 *         description: Missing or invalid authentication token
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get("/agents/me", checkJwt, adminOrAgent, AuthenticationController.getAgentsInformation);

export default router;
