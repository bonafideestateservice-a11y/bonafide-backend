import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { signUp } from "./handlers/signup";
import { login } from "./handlers/login";
import { changePassword } from "./handlers/change-password";
import { forgotPassword } from "./handlers/forgot-password";
import { resetPassword } from "./handlers/reset-password";
import { verifyOtp } from "./handlers/verify-otp/verify-otp-v1";
import { googleSignIn } from "./handlers/google-auth";
import { facebookSignIn } from "./handlers/facebook-auth";
import { getProfile } from "./handlers/get-profile";
import { updateProfile } from "./handlers/update-profile";
import { changeEmail } from "./handlers/change-email";
import { updateNotificationSettings } from "./handlers/update-notification-settings";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @swagger
 * components:
 *   schemas:
 *     ClientAuthSignUpRequest:
 *       type: object
 *       required: [fullName, email, password]
 *       properties:
 *         fullName:
 *           type: string
 *           description: Trimmed before saving; must be non-empty after trimming.
 *           example: Ada Okafor
 *         email:
 *           type: string
 *           format: email
 *           description: Trimmed and lower-cased before saving. Only checked for presence, not format.
 *           example: ada@example.com
 *         password:
 *           type: string
 *           format: password
 *           minLength: 8
 *           example: password123
 *         role:
 *           allOf:
 *             - $ref: '#/components/schemas/ROLE'
 *           description: >
 *             Honoured from the body today (any valid ROLE value, including ADMIN or AGENT).
 *             Missing or unrecognised values fall back to CLIENT.
 *         termsAndCondition:
 *           type: boolean
 *           default: false
 *           description: Stored as true only when exactly `true`; anything else stores false.
 *     ClientAuthLoginRequest:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Trimmed and lower-cased before lookup.
 *           example: ada@example.com
 *         password:
 *           type: string
 *           format: password
 *           example: password123
 *     ClientAuthTokenResponse:
 *       type: object
 *       required: [message, token, user]
 *       properties:
 *         message:
 *           type: string
 *           example: Login successful.
 *         token:
 *           type: string
 *           description: "API JWT; send as `Authorization: Bearer <token>`."
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.signature
 *         user:
 *           $ref: '#/components/schemas/User'
 *     ClientAuthSocialSignInResponse:
 *       type: object
 *       required: [message, token, user, isNewUser]
 *       properties:
 *         message:
 *           type: string
 *           example: Login successful.
 *         token:
 *           type: string
 *           description: "API JWT; send as `Authorization: Bearer <token>`."
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.signature
 *         user:
 *           $ref: '#/components/schemas/User'
 *         isNewUser:
 *           type: boolean
 *           description: True when this sign-in created the account.
 *           example: false
 *     ClientAuthStatusMessageResponse:
 *       type: object
 *       required: [status, message]
 *       properties:
 *         status:
 *           type: string
 *           enum: [success]
 *           example: success
 *         message:
 *           type: string
 *           example: Password has been changed successfully.
 *     ClientAuthChangePasswordRequest:
 *       type: object
 *       required: [currentPassword, newPassword, confirmPassword]
 *       properties:
 *         currentPassword:
 *           type: string
 *           format: password
 *           example: password123
 *         newPassword:
 *           type: string
 *           format: password
 *           minLength: 8
 *           example: newPassword456
 *         confirmPassword:
 *           type: string
 *           format: password
 *           description: Must equal newPassword.
 *           example: newPassword456
 *     ClientAuthForgotPasswordRequest:
 *       type: object
 *       required: [email]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Trimmed and lower-cased before lookup.
 *           example: ada@example.com
 *     ClientAuthForgotPasswordResponse:
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
 *           description: >
 *             The plain 6-digit OTP (valid for 10 minutes). Currently returned in the response
 *             for testing; it is also emailed to the user.
 *           example: "482913"
 *     ClientAuthVerifyOtpRequest:
 *       type: object
 *       required: [otp]
 *       properties:
 *         otp:
 *           type: string
 *           description: The 6-digit OTP from the forgot-password email. Trimmed before checking.
 *           example: "482913"
 *     ClientAuthResetPasswordRequest:
 *       type: object
 *       required: [email, otp, password]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Trimmed and lower-cased before lookup. The OTP must belong to this account.
 *           example: ada@example.com
 *         otp:
 *           type: string
 *           description: The 6-digit OTP from the forgot-password email. Trimmed before checking.
 *           example: "482913"
 *         password:
 *           type: string
 *           format: password
 *           description: The new password. No minimum length is enforced by this endpoint.
 *           example: newPassword456
 *     ClientAuthProfile:
 *       type: object
 *       required: [id, fullName, email, phone, location, profilePhoto, role]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: 3f1c2a9e-6b1d-4c1e-9a7f-2d5b8e4c1a10
 *         fullName:
 *           type: string
 *           example: Ada Okafor
 *         email:
 *           type: string
 *           format: email
 *           example: ada@example.com
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
 *           example: https://res.cloudinary.com/demo/image/upload/bonafide-services/profile-photos/abc.jpg
 *         role:
 *           $ref: '#/components/schemas/ROLE'
 *     ClientAuthUpdateProfileRequest:
 *       type: object
 *       description: At least one field (or the photo) must be provided.
 *       properties:
 *         fullName:
 *           type: string
 *           description: Must be non-empty after trimming.
 *           example: Ada Okafor
 *         phone:
 *           type: string
 *           description: Trimmed; an empty string clears it (stored as null).
 *           example: "+2348012345678"
 *         location:
 *           type: string
 *           description: Trimmed; an empty string clears it (stored as null).
 *           example: Lagos
 *     ClientAuthChangeEmailRequest:
 *       type: object
 *       required: [newEmail]
 *       description: Provide the account password as `currentPassword` or `password` (currentPassword wins if both are sent).
 *       properties:
 *         newEmail:
 *           type: string
 *           format: email
 *           description: Trimmed, lower-cased and checked against a basic email pattern.
 *           example: ada.new@example.com
 *         currentPassword:
 *           type: string
 *           format: password
 *           example: password123
 *         password:
 *           type: string
 *           format: password
 *           description: Accepted as an alias of currentPassword.
 *           example: password123
 *     ClientAuthNotificationSettingsRequest:
 *       type: object
 *       description: At least one of email, sms or push must be provided. Omitted keys are left unchanged.
 *       minProperties: 1
 *       properties:
 *         email:
 *           type: boolean
 *           example: true
 *         sms:
 *           type: boolean
 *           example: false
 *         push:
 *           type: boolean
 *           example: true
 *     ClientAuthNotificationSettings:
 *       type: object
 *       required: [id, userId, email, sms, push, createdAt, updatedAt]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: 8b0f3c4e-2a6d-4f0e-9c1b-7e5d3a2f1b90
 *         userId:
 *           type: string
 *           format: uuid
 *           example: 3f1c2a9e-6b1d-4c1e-9a7f-2d5b8e4c1a10
 *         email:
 *           type: boolean
 *           description: Defaults to false when the settings row is first created.
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
 *           example: "2026-01-15T09:30:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-02-01T12:00:00.000Z"
 *     ClientAuthSocialTokenRequestBase:
 *       type: object
 *       properties:
 *         termsAndCondition:
 *           type: boolean
 *           default: false
 *           description: Stored only when this sign-in creates the account, and only when exactly `true`.
 */

/**
 * @swagger
 * /api/{version}/client/sign-up:
 *   post:
 *     tags: [Client Authentication]
 *     summary: Create a new account with email and password
 *     description: >
 *       Creates the account, emits a USER_REGISTERED event (welcome email) and returns an API
 *       JWT plus the new user. **Note:** `role` is currently honoured from the request body, so a
 *       caller can create an ADMIN or AGENT account; any missing/unknown value defaults to CLIENT.
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
 *             $ref: '#/components/schemas/ClientAuthSignUpRequest'
 *     responses:
 *       201:
 *         description: Account created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthTokenResponse'
 *             example:
 *               message: Sign up successful.
 *               token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.signature
 *               user:
 *                 id: 3f1c2a9e-6b1d-4c1e-9a7f-2d5b8e4c1a10
 *                 fullName: Ada Okafor
 *                 email: ada@example.com
 *                 phone: null
 *                 location: null
 *                 profilePhoto: null
 *                 termsAndCondition: true
 *                 provider: local
 *                 providerId: null
 *                 role: CLIENT
 *                 paystackCustomerCode: null
 *                 createdAt: "2026-01-15T09:30:00.000Z"
 *                 updatedAt: "2026-01-15T09:30:00.000Z"
 *       400:
 *         description: >
 *           fullName missing/blank ("Full name is required."), email missing/blank ("Email is required."),
 *           password missing ("Password is required.") or shorter than 8 characters
 *           ("Password must be at least 8 characters.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: A user with this email already exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/sign-up", signUp);

/**
 * @swagger
 * /api/{version}/client/login:
 *   post:
 *     tags: [Client Authentication]
 *     summary: Log in with email and password
 *     description: >
 *       Returns an API JWT and the user (without password). The lookup is by email only, so any
 *       account role can log in here.
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
 *             $ref: '#/components/schemas/ClientAuthLoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthTokenResponse'
 *             example:
 *               message: Login successful.
 *               token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.signature
 *               user:
 *                 id: 3f1c2a9e-6b1d-4c1e-9a7f-2d5b8e4c1a10
 *                 fullName: Ada Okafor
 *                 email: ada@example.com
 *                 phone: "+2348012345678"
 *                 location: Lagos
 *                 profilePhoto: null
 *                 termsAndCondition: true
 *                 provider: local
 *                 providerId: null
 *                 role: CLIENT
 *                 paystackCustomerCode: null
 *                 createdAt: "2026-01-15T09:30:00.000Z"
 *                 updatedAt: "2026-02-01T12:00:00.000Z"
 *       400:
 *         description: Email missing/blank ("Email is required.") or password missing ("Password is required.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: >
 *           Wrong password ("Invalid credentials."), or the account has no local password because
 *           it was created via social sign-in ("This account uses social login. Please use Google or Facebook.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No account with this email ("User not found.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", login);

/**
 * @swagger
 * /api/{version}/client/change-password:
 *   post:
 *     tags: [Client Authentication]
 *     summary: Change the authenticated user's password
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
 *             $ref: '#/components/schemas/ClientAuthChangePasswordRequest'
 *     responses:
 *       200:
 *         description: Password changed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthStatusMessageResponse'
 *             example:
 *               status: success
 *               message: Password has been changed successfully.
 *       400:
 *         description: >
 *           A field is missing ("All password fields are required."), newPassword is shorter than 8
 *           characters, newPassword and confirmPassword differ, or the account has no local password
 *           (social-only account).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: >
 *           Missing, invalid or expired token, token user no longer exists, or currentPassword is
 *           wrong ("Current password is incorrect.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found (deleted between authentication and lookup).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/change-password", checkJwt, changePassword);

/**
 * @swagger
 * /api/{version}/client/profile:
 *   get:
 *     tags: [Client Profile]
 *     summary: Get the authenticated user's profile
 *     description: Returns the profile object directly (no envelope).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     responses:
 *       200:
 *         description: The profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthProfile'
 *       401:
 *         description: Missing, invalid or expired token, or the token user no longer exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Profile not found (user deleted after authentication).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   patch:
 *     tags: [Client Profile]
 *     summary: Update the authenticated user's profile (name, phone, location, photo)
 *     description: >
 *       Partial update; send any of the fields. Use multipart/form-data to upload a photo (it is
 *       uploaded to Cloudinary and its secure URL stored as profilePhoto); JSON works for the text
 *       fields only. No file size or type limits are enforced by the API; Cloudinary rejects
 *       non-images (which surfaces as a 500). Returns the updated profile directly (no envelope).
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
 *             allOf:
 *               - $ref: '#/components/schemas/ClientAuthUpdateProfileRequest'
 *               - type: object
 *                 properties:
 *                   profilePhoto:
 *                     type: string
 *                     format: binary
 *                     description: Single image file. Any other file field name causes a 500.
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClientAuthUpdateProfileRequest'
 *     responses:
 *       200:
 *         description: The updated profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthProfile'
 *       400:
 *         description: >
 *           fullName is blank or not a string, phone or location is not a string, or nothing to
 *           update was sent ("No profile changes provided.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing, invalid or expired token, or the token user no longer exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Profile not found (user deleted after authentication).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Photo upload failed, unexpected multipart field, or database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/profile", checkJwt, getProfile);

router.patch("/profile", checkJwt, upload.single("profilePhoto"), updateProfile);

/**
 * @swagger
 * /api/{version}/client/profile/email:
 *   patch:
 *     tags: [Client Profile]
 *     summary: Change the authenticated user's email
 *     description: >
 *       Requires the account password as confirmation, so it isn't available to social-only
 *       accounts. Returns the updated profile directly (no envelope).
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
 *             $ref: '#/components/schemas/ClientAuthChangeEmailRequest'
 *     responses:
 *       200:
 *         description: The updated profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthProfile'
 *       400:
 *         description: >
 *           newEmail missing/blank ("New email is required."), password missing ("Password
 *           confirmation is required."), newEmail malformed ("A valid email is required."), or the
 *           account has no local password ("This account does not have a local password.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing, invalid or expired token, token user no longer exists, or wrong password ("Password is incorrect.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Profile not found (user deleted after authentication).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Another account already uses this email ("Email is already in use.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch("/profile/email", checkJwt, changeEmail);

/**
 * @swagger
 * /api/{version}/client/notification-settings:
 *   patch:
 *     tags: [Client Profile]
 *     summary: Update the authenticated user's notification settings
 *     description: >
 *       Creates the settings row on first use (unspecified channels default to false) and
 *       otherwise updates only the provided keys. Returns the settings row directly (no envelope).
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
 *             $ref: '#/components/schemas/ClientAuthNotificationSettingsRequest'
 *     responses:
 *       200:
 *         description: The updated notification settings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthNotificationSettings'
 *       400:
 *         description: >
 *           A provided key is not a boolean ("email must be a boolean." etc.), or none of email,
 *           sms, push was provided ("At least one notification setting must be provided.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing, invalid or expired token, or the token user no longer exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Profile not found (user deleted after authentication).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch("/notification-settings", checkJwt, updateNotificationSettings);

/**
 * @swagger
 * /api/{version}/client/forgot-password:
 *   post:
 *     tags: [Client Authentication]
 *     summary: Send a password reset OTP to an email
 *     description: >
 *       Generates a 6-digit OTP valid for 10 minutes, stores its SHA-256 hash, and emits a
 *       FORGOT_PASSWORD event that emails it. The plain OTP is also returned in the response
 *       (marked in code as for testing only).
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
 *             $ref: '#/components/schemas/ClientAuthForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: OTP generated and email dispatched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthForgotPasswordResponse'
 *       400:
 *         description: Email missing/blank ("Email is required.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No account with this email ("No account found with that email address.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server or database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/forgot-password", forgotPassword);

/**
 * @swagger
 * /api/{version}/client/verify-otp:
 *   post:
 *     tags: [Client Authentication]
 *     summary: Check that a password reset OTP is valid
 *     description: >
 *       Checks the OTP exists, is unused and unexpired. It is not tied to an email here, and it
 *       does not consume the OTP; reset-password does that.
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
 *             $ref: '#/components/schemas/ClientAuthVerifyOtpRequest'
 *     responses:
 *       200:
 *         description: OTP is valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthStatusMessageResponse'
 *             example:
 *               status: success
 *               message: OTP verified successfully.
 *       400:
 *         description: OTP missing ("OTP is required.") or invalid/expired/used ("OTP is invalid or has expired.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server or database error, including a non-string otp.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/verify-otp", verifyOtp);

/**
 * @swagger
 * /api/{version}/client/reset-password:
 *   post:
 *     tags: [Client Authentication]
 *     summary: Reset a password using a valid OTP
 *     description: Sets the new password and marks the OTP as used.
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
 *             $ref: '#/components/schemas/ClientAuthResetPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthStatusMessageResponse'
 *             example:
 *               status: success
 *               message: Password has been reset successfully.
 *       400:
 *         description: >
 *           A field is missing ("Email, OTP, and password are required."), no account has this
 *           email ("Invalid email or OTP."), or the OTP is invalid, expired, used, or belongs to
 *           another account ("OTP is invalid or has expired.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server or database error, including non-string email or otp.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/reset-password", resetPassword);

/**
 * @swagger
 * /api/{version}/client/auth/google/token:
 *   post:
 *     tags: [Client Authentication]
 *     summary: Sign in with a Google ID token (token exchange)
 *     description: >
 *       The frontend signs the user in with Google Identity Services (web) or the Google
 *       Sign-In SDK (mobile) and posts the ID token here. The API verifies it with Google and
 *       returns its own JWT. Signs in the account already linked to this Google ID; otherwise
 *       links an existing client account with the same, Google-verified email; otherwise creates
 *       a client account (emitting USER_REGISTERED).
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
 *             allOf:
 *               - type: object
 *                 required: [idToken]
 *                 properties:
 *                   idToken:
 *                     type: string
 *                     description: Google ID token (the GIS `credential`). Trimmed before verifying.
 *                     example: eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...
 *               - $ref: '#/components/schemas/ClientAuthSocialTokenRequestBase'
 *     responses:
 *       200:
 *         description: Signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthSocialSignInResponse'
 *       400:
 *         description: idToken missing/blank ("idToken is required."), or the Google account shared no email.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid or expired Google ID token, or one issued for another client ID ("Invalid Google ID token.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: The matching account is an ADMIN or AGENT ("This account can't sign in with Google.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: >
 *           A client account with this email exists but Google hasn't verified the email
 *           ("An account with this email already exists. Sign in with your password instead.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server or database error, or Google sign-in is not configured (GOOGLE_CLIENT_ID unset).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/auth/google/token", googleSignIn);

/**
 * @swagger
 * /api/{version}/client/auth/facebook/token:
 *   post:
 *     tags: [Client Authentication]
 *     summary: Sign in with a Facebook access token (token exchange)
 *     description: >
 *       The frontend signs the user in with the Facebook JS SDK (web) or Facebook SDK (mobile)
 *       and posts the user access token here. The API checks the token was issued for this
 *       Facebook app, loads the profile, and returns its own JWT. Account linking and creation
 *       work as for Google sign-in; an email returned by Facebook is treated as verified.
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
 *             allOf:
 *               - type: object
 *                 required: [accessToken]
 *                 properties:
 *                   accessToken:
 *                     type: string
 *                     description: Facebook user access token. Trimmed before verifying.
 *                     example: EAAGm0PX4ZCpsBA...
 *               - $ref: '#/components/schemas/ClientAuthSocialTokenRequestBase'
 *     responses:
 *       200:
 *         description: Signed in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientAuthSocialSignInResponse'
 *       400:
 *         description: accessToken missing/blank ("accessToken is required."), or the Facebook account shared no email.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid or expired Facebook access token, or one issued for another app ("Invalid Facebook access token.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: The matching account is an ADMIN or AGENT ("This account can't sign in with Facebook.").
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: >
 *           Unexpected server, database or Graph API error, or Facebook sign-in is not configured
 *           (FACEBOOK_CLIENT_ID / FACEBOOK_SECRET_KEY unset).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/auth/facebook/token", facebookSignIn);

export default router;
