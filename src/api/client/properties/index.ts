import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { getPropertyHandler } from "./handlers/get-property";
import { createPropertyInquiryHandler } from "./handlers/create-property-inquiry";
import { addPropertyFavoriteHandler } from "./handlers/add-property-favorite";
import { removePropertyFavoriteHandler } from "./handlers/remove-property-favorite";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ClientPropertyFavorite:
 *       type: object
 *       properties:
 *         propertyId: { type: string }
 *         isFavorite: { type: boolean }
 *   responses:
 *     ClientPropertyNotFound:
 *       description: No published property has this ID.
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *           example: { status: error, message: Property not found. }
 *     ClientPropertyUnauthorized:
 *       description: No token, an invalid or expired token, or the user no longer exists.
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *           example: { status: error, message: Invalid token }
 *     ClientPropertyServerError:
 *       description: A database query failed.
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *           example: { status: error, message: Internal server error. }
 */

/**
 * @swagger
 * /api/{version}/client/properties/{id}:
 *   get:
 *     tags: [Properties]
 *     summary: Public property details
 *     description: >
 *       A published property. Every call adds one view. No login needed; when a valid token is
 *       sent, isFavorite says whether that user saved the property (otherwise it is false).
 *     security:
 *       - {}
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The property.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/AdminDashboardProperty'
 *                 - type: object
 *                   properties:
 *                     status: { type: string, enum: [PENDING, VERIFIED, REJECTED] }
 *                     verifiedAt: { type: string, format: date-time, nullable: true }
 *                     isFavorite: { type: boolean }
 *       404: { $ref: '#/components/responses/ClientPropertyNotFound' }
 *       500: { $ref: '#/components/responses/ClientPropertyServerError' }
 */
router.get("/properties/:id", getPropertyHandler);

/**
 * @swagger
 * /api/{version}/client/properties/{id}/inquiries:
 *   post:
 *     tags: [Properties]
 *     summary: Make an inquiry about a property
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, maxLength: 2000, example: Is this property still available? }
 *     responses:
 *       201:
 *         description: The inquiry was saved.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 propertyId: { type: string }
 *                 message: { type: string }
 *                 createdAt: { type: string, format: date-time }
 *       400:
 *         description: message is missing, blank or too long.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: message is required. }
 *       401: { $ref: '#/components/responses/ClientPropertyUnauthorized' }
 *       404: { $ref: '#/components/responses/ClientPropertyNotFound' }
 *       500: { $ref: '#/components/responses/ClientPropertyServerError' }
 */
router.post("/properties/:id/inquiries", checkJwt, createPropertyInquiryHandler);

/**
 * @swagger
 * /api/{version}/client/properties/{id}/favorite:
 *   post:
 *     tags: [Properties]
 *     summary: Save a property to favorites
 *     description: Saving an already saved property changes nothing.
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The property is in the user's favorites.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClientPropertyFavorite' }
 *       401: { $ref: '#/components/responses/ClientPropertyUnauthorized' }
 *       404: { $ref: '#/components/responses/ClientPropertyNotFound' }
 *       500: { $ref: '#/components/responses/ClientPropertyServerError' }
 *   delete:
 *     tags: [Properties]
 *     summary: Remove a property from favorites
 *     description: Removing a property that isn't saved changes nothing.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The property is not in the user's favorites.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClientPropertyFavorite' }
 *       401: { $ref: '#/components/responses/ClientPropertyUnauthorized' }
 *       500: { $ref: '#/components/responses/ClientPropertyServerError' }
 */
router.post("/properties/:id/favorite", checkJwt, addPropertyFavoriteHandler);
router.delete("/properties/:id/favorite", checkJwt, removePropertyFavoriteHandler);

export default router;
