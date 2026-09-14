import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { signUp } from "./handlers/signup";
import { login } from "./handlers/login";
import { changePassword } from "./handlers/change-password";
import { forgotPassword } from "./handlers/forgot-password";
import { resetPassword } from "./handlers/reset-password";
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

const router = Router();

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
 * /api/{version}/auth/reset-password/{token}:
 *   post:
 *     tags: [Authentication]
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
 *         description: Plain reset token received via email
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StatusMessageResponse'
 *       400:
 *         description: Invalid/expired token or missing password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/reset-password/:token", resetPassword);

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
