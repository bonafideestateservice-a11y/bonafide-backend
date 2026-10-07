import { Router } from "express";
import { ROLE } from "@prisma/client";
import { checkJwt } from "../../../middlewares/check-jwt";
import { checkRoles } from "../../../middlewares/check-roles";
import { login } from "./handlers/login/login-v1";
import { changePassword } from "./handlers/change-password/change-password-v1";
import { forgotPassword } from "./handlers/forgot-password/forgot-password-v1";
import { resetPassword } from "./handlers/reset-password/reset-password-v1";
import { verifyOtp } from "./handlers/verify-otp/verify-otp-v1";
import { getAgentsInformation } from "./handlers/get-agents-information/get-agents-information.v1";
import { getProfile } from "./handlers/get-profile/get-profile-v1";
import { updateProfile } from "./handlers/update-profile/update-profile-v1";
import { changeEmail } from "./handlers/change-email/change-email-v1";
import { updateNotificationSettings } from "./handlers/update-notification-settings/update-notification-settings-v1";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const adminOrAgent = checkRoles([ROLE.ADMIN, ROLE.AGENT]);

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminAuthLoginRequest:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Case-insensitive; trimmed and lower-cased before lookup.
 *           example: admin@bonafide.com
 *         password:
 *           type: string
 *           format: password
 *           example: Str0ngPassw0rd!
 *     AdminAuthLoginResponse:
 *       type: object
 *       required: [message, token, user]
 *       properties:
 *         message:
 *           type: string
 *           example: Login successful.
 *         token:
 *           type: string
 *           description: HS256 JWT whose payload carries only the user id. Send as `Authorization Bearer <token>`.
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjNmYTg1ZjY0In0.signature
 *         user:
 *           $ref: '#/components/schemas/User'
 *     AdminAuthStatusMessage:
 *       type: object
 *       required: [status, message]
 *       properties:
 *         status:
 *           type: string
 *           enum: [success]
 *           example: success
 *         message:
 *           type: string
 *     AdminAuthForgotPasswordResponse:
 *       type: object
 *       required: [status, message, otp]
 *       properties:
 *         status:
 *           type: string
 *           enum: [success]
 *           example: success
 *         message:
 *           type: string
 *           example: Password reset OTP sent to email.
 *         otp:
 *           type: string
 *           pattern: '^[0-9]{6}$'
 *           description: The plain 6-digit OTP. Currently echoed in the response (marked TODO in code to remove for production).
 *           example: "482913"
 *     AdminAuthProfile:
 *       type: object
 *       description: The admin/agent profile projection (selected User columns only).
 *       required: [id, fullName, email, phone, location, profilePhoto, role]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *         fullName:
 *           type: string
 *           example: Ada Okafor
 *         email:
 *           type: string
 *           format: email
 *           example: ada@bonafide.com
 *         phone:
 *           type: string
 *           nullable: true
 *           example: "+2348012345678"
 *         location:
 *           type: string
 *           nullable: true
 *           example: Lagos
 *         profilePhoto:
 *           type: string
 *           format: uri
 *           nullable: true
 *           example: https://res.cloudinary.com/demo/image/upload/v1/bonafide-services/profile-photos/abc.jpg
 *         role:
 *           $ref: '#/components/schemas/ROLE'
 *     AdminAuthNotificationSettings:
 *       type: object
 *       description: The user's NotificationSettings row (created on first update).
 *       required: [id, userId, email, sms, push, createdAt, updatedAt]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         userId:
 *           type: string
 *           format: uuid
 *         email:
 *           type: boolean
 *           example: true
 *         sms:
 *           type: boolean
 *           example: false
 *         push:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     AdminAuthAgentSelf:
 *       type: object
 *       required: [id, firstName, lastName]
 *       properties:
 *         id:
 *           type: string
 *           description: VerificationAgent id (cuid), not the user id.
 *           example: clx3k9z0a0000qz8h1b2c3d4e
 *         firstName:
 *           type: string
 *           description: First whitespace-separated word of the user's fullName.
 *           example: Ada
 *         lastName:
 *           type: string
 *           description: Remaining words of fullName joined by single spaces; empty string for single-word names.
 *           example: Okafor
 */

/**
 * @swagger
 * /api/{version}/admin/login:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Log in as an admin or agent
 *     description: >
 *       Public. Looks the user up by email (case-insensitive), rejects any role other than
 *       ADMIN or AGENT, verifies the password and returns a JWT plus the user row without the
 *       password hash. The role check happens before the password check.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminAuthLoginRequest'
 *     responses:
 *       200:
 *         description: Login successful.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminAuthLoginResponse'
 *       400:
 *         description: "`email` is missing/blank/not a string (\"Email is required.\") or `password` is missing/not a string (\"Password is required.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: "Wrong password (\"Invalid credentials.\") or the account has no local password, e.g. a social-login account (\"This account does not have a local password configured.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: "The account exists but its role is CLIENT (\"Insufficient permissions.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "No user with that email (\"Admin not found.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/login", login);

/**
 * @swagger
 * /api/{version}/admin/change-password:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Change the authenticated admin's or agent's password
 *     description: Requires role ADMIN or AGENT. Verifies the current password before storing the new one.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirmPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 example: OldPassw0rd!
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: NewPassw0rd!
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 description: Must equal `newPassword`.
 *                 example: NewPassw0rd!
 *     responses:
 *       200:
 *         description: Password changed.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/AdminAuthStatusMessage'
 *               example:
 *                 status: success
 *                 message: Password has been changed successfully.
 *       400:
 *         description: "A field is missing (\"All password fields are required.\"), `newPassword` is shorter than 8 characters, `newPassword` != `confirmPassword`, or the account has no local password (\"This account does not have a local password to change.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: "Missing, invalid, expired or malformed token, token user no longer exists, or `currentPassword` is wrong (\"Current password is incorrect.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The authenticated user is not an ADMIN or AGENT.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "The user could not be found (\"Admin not found.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/change-password", checkJwt, adminOrAgent, changePassword);

/**
 * @swagger
 * /api/{version}/admin/profile:
 *   get:
 *     tags: [Admin Authentication]
 *     summary: Get the authenticated admin's or agent's profile
 *     description: Requires role ADMIN or AGENT.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     responses:
 *       200:
 *         description: The profile.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminAuthProfile'
 *       401:
 *         description: Missing, invalid, expired or malformed token, or the token user no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The authenticated user is not an ADMIN or AGENT.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "The user could not be found (\"Profile not found.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/profile", checkJwt, adminOrAgent, getProfile);

/**
 * @swagger
 * /api/{version}/admin/profile:
 *   patch:
 *     tags: [Admin Authentication]
 *     summary: Update the authenticated admin's or agent's profile
 *     description: >
 *       Requires role ADMIN or AGENT. Partial update: send any subset of the fields, at least one.
 *       `phone` and `location` are trimmed and an empty string clears them (stored as null).
 *       `profilePhoto` is uploaded to Cloudinary as an image and its secure URL is stored.
 *       No file size or type limit is enforced by the server; a file Cloudinary rejects results in a 500.
 *       The same fields are also accepted as JSON or urlencoded bodies (without the photo).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               fullName:
 *                 type: string
 *                 minLength: 1
 *                 description: Must be non-empty after trimming.
 *                 example: Ada Okafor
 *               phone:
 *                 type: string
 *                 description: Empty string clears the phone.
 *                 example: "+2348012345678"
 *               location:
 *                 type: string
 *                 description: Empty string clears the location.
 *                 example: Lagos
 *               profilePhoto:
 *                 type: string
 *                 format: binary
 *                 description: A single image file (field name `profilePhoto`, max 1 file).
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               fullName: { type: string, minLength: 1, example: Ada Okafor }
 *               phone: { type: string, example: "+2348012345678" }
 *               location: { type: string, example: Lagos }
 *     responses:
 *       200:
 *         description: The updated profile.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminAuthProfile'
 *       400:
 *         description: "`fullName` is blank or not a string, `phone`/`location` is not a string, or no fields/file were provided (\"No profile changes provided.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid, expired or malformed token, or the token user no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The authenticated user is not an ADMIN or AGENT.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "The user could not be found (\"Profile not found.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Cloudinary upload failure, unexpected multipart field name (multer error), or database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch("/profile", checkJwt, adminOrAgent, upload.single("profilePhoto"), updateProfile);

/**
 * @swagger
 * /api/{version}/admin/profile/email:
 *   patch:
 *     tags: [Admin Authentication]
 *     summary: Change the authenticated admin's or agent's email
 *     description: >
 *       Requires role ADMIN or AGENT. The new email is trimmed and lower-cased. The account
 *       password must be supplied as `password` or, alternatively, `currentPassword`
 *       (`currentPassword` takes precedence when both are sent).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newEmail]
 *             properties:
 *               newEmail:
 *                 type: string
 *                 format: email
 *                 example: ada.new@bonafide.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Current account password. Required unless `currentPassword` is sent.
 *                 example: Str0ngPassw0rd!
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 description: Alias for `password`; used in preference to it when present.
 *     responses:
 *       200:
 *         description: The updated profile.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminAuthProfile'
 *       400:
 *         description: "`newEmail` missing/blank (\"New email is required.\"), no password given (\"Password confirmation is required.\"), invalid email format (\"A valid email is required.\"), or the account has no local password."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: "Missing, invalid, expired or malformed token, token user no longer exists, or the password is wrong (\"Password is incorrect.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The authenticated user is not an ADMIN or AGENT.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "The user could not be found (\"Profile not found.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: "Another user already has that email (\"Email is already in use.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch("/profile/email", checkJwt, adminOrAgent, changeEmail);

/**
 * @swagger
 * /api/{version}/admin/notification-settings:
 *   patch:
 *     tags: [Admin Authentication]
 *     summary: Update the authenticated admin's or agent's notification settings
 *     description: >
 *       Requires role ADMIN or AGENT. Partial update: send at least one of `email`, `sms`, `push`
 *       as a JSON boolean. Creates the settings row (other channels default to false) if it does not exist.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               email: { type: boolean, example: true }
 *               sms: { type: boolean, example: false }
 *               push: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: The saved notification settings.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminAuthNotificationSettings'
 *       400:
 *         description: "A provided field is not a boolean (e.g. \"email must be a boolean.\") or none was provided (\"At least one notification setting must be provided.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid, expired or malformed token, or the token user no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The authenticated user is not an ADMIN or AGENT.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "The user could not be found (\"Profile not found.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch("/notification-settings", checkJwt, adminOrAgent, updateNotificationSettings);

/**
 * @swagger
 * /api/{version}/admin/forgot-password:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Request a password reset OTP
 *     description: >
 *       Public. Generates a 6-digit OTP valid for 10 minutes, stores its SHA-256 hash and emits a
 *       FORGOT_PASSWORD event that emails it. Note that the lookup is by email only (no role filter),
 *       and the OTP is currently also returned in the response body.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Case-insensitive; trimmed and lower-cased before lookup.
 *                 example: admin@bonafide.com
 *     responses:
 *       200:
 *         description: OTP generated and email dispatched.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminAuthForgotPasswordResponse'
 *       400:
 *         description: "`email` is missing, blank or not a string (\"Email is required.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "No user with that email (\"No account found with that email address.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/forgot-password", forgotPassword);

/**
 * @swagger
 * /api/{version}/admin/verify-otp:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Check that a password reset OTP is valid
 *     description: >
 *       Public. Succeeds if any unused, unexpired reset token matches the OTP; it is not tied to an
 *       email and does not consume the OTP (use reset-password for that).
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
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
 *                 description: The 6-digit OTP (surrounding whitespace is trimmed).
 *                 example: "482913"
 *     responses:
 *       200:
 *         description: OTP is valid.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/AdminAuthStatusMessage'
 *               example:
 *                 status: success
 *                 message: OTP verified successfully.
 *       400:
 *         description: "`otp` missing (\"OTP is required.\") or no matching unused, unexpired token (\"OTP is invalid or has expired.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected error, including when `otp` is sent as a non-string (e.g. a number).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/verify-otp", verifyOtp);

/**
 * @swagger
 * /api/{version}/admin/reset-password:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Reset a password using a valid OTP
 *     description: >
 *       Public. The OTP must be unused, unexpired and belong to the user with the given email.
 *       On success the password is replaced and the OTP is marked as used. No password strength
 *       rules are enforced.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
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
 *                 format: email
 *                 example: admin@bonafide.com
 *               otp:
 *                 type: string
 *                 example: "482913"
 *               password:
 *                 type: string
 *                 format: password
 *                 description: The new password.
 *                 example: NewPassw0rd!
 *     responses:
 *       200:
 *         description: Password reset.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/AdminAuthStatusMessage'
 *               example:
 *                 status: success
 *                 message: Password has been reset successfully.
 *       400:
 *         description: "A field is missing (\"Email, OTP, and password are required.\"), no user has that email (\"Invalid email or OTP.\"), or the OTP is invalid, expired, used, or belongs to another user (\"OTP is invalid or has expired.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected error, including when `email` or `otp` is sent as a non-string.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/reset-password", resetPassword);

/**
 * @swagger
 * /api/{version}/admin/agents/me:
 *   get:
 *     tags: [Admin Authentication]
 *     summary: Get the authenticated agent's verification-agent record
 *     description: >
 *       Requires role ADMIN or AGENT, but only succeeds for users that have a VerificationAgent
 *       record (in practice agents); other users get 404. Returns the agent id and the user's
 *       fullName split into first and last name.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     responses:
 *       200:
 *         description: The agent's id and name.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminAuthAgentSelf'
 *       401:
 *         description: Missing, invalid, expired or malformed token, or the token user no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The authenticated user is not an ADMIN or AGENT.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: "The user has no VerificationAgent record (\"Verification agent not found.\")."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/agents/me", checkJwt, adminOrAgent, getAgentsInformation);

export default router;
