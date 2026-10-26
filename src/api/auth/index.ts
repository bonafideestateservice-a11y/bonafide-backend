import { Router } from "express";
import { login } from "./handlers/login";

const router = Router();

/**
 * @swagger
 * /api/{version}/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Log in as any user (client, admin or agent)
 *     description: >
 *       One login for every role. Returns a JWT and the user without the password hash; route
 *       the user on `user.role`. Agents created by an admin get `user.mustChangePassword: true`
 *       until they change their password. /client/login and /admin/login keep working.
 *     security: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, description: Case-insensitive, example: ada@example.com }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Login successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: Login successful. }
 *                 token: { type: string, description: "Send as Authorization: Bearer <token>" }
 *                 user:
 *                   allOf:
 *                     - $ref: '#/components/schemas/User'
 *                     - type: object
 *                       properties:
 *                         role: { type: string, enum: [CLIENT, ADMIN, AGENT] }
 *       400:
 *         description: Email or password missing.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       401:
 *         description: >
 *           Unknown email or wrong password ("Invalid email or password."), or the account only
 *           uses Google/Facebook sign-in.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       403:
 *         description: The account is suspended.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       500:
 *         description: Unexpected server or database error.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.post("/login", login);

export default router;
