import { Router } from "express";

import { loginHandler } from "./handlers/login/login-v1";
import { signUpHandler } from "./handlers/sign-up/sign-up-v1";
import { refreshTokenHandler } from "./handlers/refresh-token/refresh-token-v1";

const router = Router();

/**
 * @swagger
 * /api/{version}/auth/sign-up:
 *   post:
 *     tags: [Authentication]
 *     summary: Create a new user account
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
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password, minLength: 8 }
 *     responses:
 *       201:
 *         description: User created
 */
router.post("/sign-up", signUpHandler);

/**
 * @swagger
 * /api/{version}/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Log in and receive tokens
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
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Logged in
 */
router.post("/login", loginHandler);

/**
 * @swagger
 * /api/{version}/auth/refresh-token:
 *   post:
 *     tags: [Authentication]
 *     summary: Exchange a refresh token for a new access token
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New access token issued
 */
router.post("/refresh-token", refreshTokenHandler);

export default router;