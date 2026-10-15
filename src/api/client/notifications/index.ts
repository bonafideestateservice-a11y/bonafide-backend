import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { getClientNotificationsHandler } from "./handlers/get-notifications";
import { markClientNotificationReadHandler } from "./handlers/mark-notification-read";
import { markAllClientNotificationsReadHandler } from "./handlers/mark-all-notifications-read";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ClientUpdate:
 *       type: object
 *       description: One card on the client's Updates screen.
 *       properties:
 *         id: { type: string }
 *         type:
 *           type: string
 *           enum: [VERIFICATION_REQUEST_CREATED, PAYMENT_RECEIVED, AGENT_ASSIGNED, INSPECTION_STARTED, REPORT_UPLOADED]
 *           example: AGENT_ASSIGNED
 *         title:
 *           type: string
 *           description: >
 *             Built from the type: "Verification Request Submitted", "New Agent Assigned",
 *             "Inspection Started", "<verification type> Complete"; payments keep their stored title.
 *           example: New Agent Assigned
 *         body: { type: string, example: Sarah Johnson has been assigned to your Lekki Phase 1 Apartment verification }
 *         verificationType:
 *           type: object
 *           nullable: true
 *           description: For the card's icon.
 *           properties:
 *             name: { type: string, example: Property Verification }
 *             slug: { type: string, example: property-verification }
 *         subjectName:
 *           type: string
 *           nullable: true
 *           description: The request's property name, business name or address.
 *           example: Lekki Phase 1 Apartment
 *         verificationRequestId: { type: string, nullable: true }
 *         reportId: { type: string, nullable: true, description: REPORT_UPLOADED only; for "View Report". }
 *         read: { type: boolean }
 *         createdAt: { type: string, format: date-time }
 *   responses:
 *     ClientNotificationsUnauthorized:
 *       description: Missing, invalid or expired token, or the token's user no longer exists
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *     ClientNotificationsServerError:
 *       description: Database error ("Internal server error.")
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 */

/**
 * @swagger
 * /api/{version}/client/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: The client's Updates screen
 *     description: >
 *       The client's in-app notifications (request created, payment received, agent assigned,
 *       inspection started, report ready), newest first. Report-ready updates aren't created for
 *       requests where the client turned off report notifications.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: unreadOnly, schema: { type: boolean, default: false } }
 *     responses:
 *       200:
 *         description: A page of updates and the unread count.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: '#/components/schemas/ClientUpdate' } }
 *                 unreadCount: { type: integer, example: 2 }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     totalItems: { type: integer }
 *                     totalPages: { type: integer }
 *       400:
 *         description: Invalid page or limit
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401: { $ref: '#/components/responses/ClientNotificationsUnauthorized' }
 *       500: { $ref: '#/components/responses/ClientNotificationsServerError' }
 */
router.get("/notifications", checkJwt, getClientNotificationsHandler);

/**
 * @swagger
 * /api/{version}/client/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all of the client's updates as read
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *     responses:
 *       200:
 *         description: How many updates were marked read.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 updated: { type: integer, example: 3 }
 *       401: { $ref: '#/components/responses/ClientNotificationsUnauthorized' }
 *       500: { $ref: '#/components/responses/ClientNotificationsServerError' }
 */
router.patch("/notifications/read-all", checkJwt, markAllClientNotificationsReadHandler);

/**
 * @swagger
 * /api/{version}/client/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark one update as read
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The update is read.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 read: { type: boolean, example: true }
 *       401: { $ref: '#/components/responses/ClientNotificationsUnauthorized' }
 *       404:
 *         description: No in-app notification with this id belongs to the client
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500: { $ref: '#/components/responses/ClientNotificationsServerError' }
 */
router.patch("/notifications/:id/read", checkJwt, markClientNotificationReadHandler);

export default router;
