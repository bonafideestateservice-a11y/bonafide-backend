import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { signUp } from "./handlers/signup";
import { login } from "./handlers/login";
import { changePassword } from "./handlers/change-password";
import { forgotPassword } from "./handlers/forgot-password";
import { resetPassword } from "./handlers/reset-password";
import { verifyOtp } from "./handlers/verify-otp/verify-otp-v1";
import {
  initiateGoogleLogin,
  handleGoogleCallback,
  googleLoginSuccess,
  googleLoginError,
  googleLogout,
} from "./handlers/google-auth";
import {
  initiateFacebookLogin,
  handleFacebookCallback,
  facebookLoginSuccess,
  facebookLoginError,
  facebookLogout,
} from "./handlers/facebook-auth";
import { getProfile } from "./handlers/get-profile";
import { updateProfile } from "./handlers/update-profile";
import { changeEmail } from "./handlers/change-email";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @swagger
 * /api/{version}/auth/sign-up:
 *   post:
 *     tags: [Authentication]
 *     summary: Create a new user account
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
 *             $ref: '#/components/schemas/SignUpRequest'
 *     responses:
 *       201:
 *         description: Account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Missing or invalid fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: A user with this email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/sign-up", signUp);

/**
 * @swagger
 * /api/{version}/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Authenticate and receive a JWT access token
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
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Missing email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", login);

/**
 * @swagger
 * /api/{version}/auth/change-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Change the authenticated user's password
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
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StatusMessageResponse'
 *       400:
 *         description: Missing, invalid, or mismatched password fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing/invalid token or incorrect current password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
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
 *     tags: [Authentication]
 *     summary: Get the authenticated client profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Client profile }
 *       401: { description: Missing or invalid authentication token }
 *       404: { description: Profile not found }
 */
router.get("/profile", checkJwt, getProfile);

/**
 * @swagger
 * /api/{version}/client/profile:
 *   patch:
 *     tags: [Authentication]
 *     summary: Update the authenticated client profile
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
 *       200: { description: Updated client profile }
 *       400: { description: Invalid or empty profile update }
 *       401: { description: Missing or invalid authentication token }
 *       404: { description: Profile not found }
 */
router.patch("/profile", checkJwt, upload.single("profilePhoto"), updateProfile);

/**
 * @swagger
 * /api/{version}/client/profile/email:
 *   patch:
 *     tags: [Authentication]
 *     summary: Change the authenticated client email
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
 *       200: { description: Updated client profile }
 *       400: { description: Invalid email or password confirmation }
 *       401: { description: Incorrect password }
 *       409: { description: Email already in use }
 */
router.patch("/profile/email", checkJwt, changeEmail);

/**
 * @swagger
 * /api/{version}/auth/forgot-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Request a password reset token for an email
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
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: Reset token generated and email dispatched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForgotPasswordResponse'
 *       400:
 *         description: Email is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No account found with that email
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
 *     tags: [Authentication]
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
router.post("/verify-otp", verifyOtp);

/**
 * @swagger
 * /api/{version}/client/reset-password:
 *   post:
 *     tags: [Authentication]
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
router.post("/reset-password", resetPassword);

/**
 * @swagger
 * /api/{version}/client/auth/google:
 *   get:
 *     tags: [Client Authentication]
 *     summary: Redirect the user to Google OAuth consent
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: Redirect to Google login page
 */
router.get("/auth/google", initiateGoogleLogin);

/**
 * @swagger
 * /api/{version}/client/auth/google/callback:
 *   get:
 *     tags: [Client Authentication]
 *     summary: Handle the Google OAuth callback and return a JWT
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Google login completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 */
router.get("/auth/google/callback", handleGoogleCallback);

/**
 * @swagger
 * /api/{version}/client/auth/google/success:
 *   get:
 *     tags: [Client Authentication]
 *     summary: Return the logged-in Google user payload
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Google login success payload
 */
router.get("/auth/google/success", googleLoginSuccess);

/**
 * @swagger
 * /api/{version}/client/auth/google/error:
 *   get:
 *     tags: [Client Authentication]
 *     summary: Return a Google auth failure response
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       401:
 *         description: Google authentication failed
 */
router.get("/auth/google/error", googleLoginError);

/**
 * @swagger
 * /api/{version}/client/auth/google/logout:
 *   get:
 *     tags: [Client Authentication]
 *     summary: Destroy the Google session and logout the user
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session destroyed successfully
 */
router.get("/auth/google/logout", googleLogout);

/**
 * @swagger
 * /api/{version}/client/auth/facebook:
 *   get:
 *     tags: [Client Authentication]
 *     summary: Redirect the user to Facebook OAuth consent
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: Redirect to Facebook login page
 */
router.get("/auth/facebook", initiateFacebookLogin);

/**
 * @swagger
 * /api/{version}/client/auth/facebook/callback:
 *   get:
 *     tags: [Client Authentication]
 *     summary: Handle the Facebook OAuth callback and return a JWT
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Facebook login completed successfully
 */
router.get("/auth/facebook/callback", handleFacebookCallback);

/**
 * @swagger
 * /api/{version}/client/auth/facebook/success:
 *   get:
 *     tags: [Client Authentication]
 *     summary: Return the logged-in Facebook user payload
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Facebook login success payload
 */
router.get("/auth/facebook/success", facebookLoginSuccess);

/**
 * @swagger
 * /api/{version}/client/auth/facebook/error:
 *   get:
 *     tags: [Client Authentication]
 *     summary: Return a Facebook auth failure response
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       401:
 *         description: Facebook authentication failed
 */
router.get("/auth/facebook/error", facebookLoginError);

/**
 * @swagger
 * /api/{version}/client/auth/facebook/logout:
 *   get:
 *     tags: [Client Authentication]
 *     summary: Destroy the Facebook session and logout the user
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session destroyed successfully
 */
router.get("/auth/facebook/logout", facebookLogout);

export default router;
