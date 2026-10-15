import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { getPropertyHandler } from "./handlers/get-property";
import { getPropertiesHandler } from "./handlers/get-properties";
import { getPropertyLocationsHandler } from "./handlers/get-property-locations";
import { createPropertyInquiryHandler } from "./handlers/create-property-inquiry";
import { addPropertyFavoriteHandler } from "./handlers/add-property-favorite";
import { removePropertyFavoriteHandler } from "./handlers/remove-property-favorite";
import { idempotent } from "../../../middlewares/idempotency";
import { createPurchaseRequestHandler } from "./handlers/create-purchase-request";
import { createConsultationRequestHandler } from "./handlers/create-consultation-request";
import { getPropertyRequestsHandler } from "./handlers/get-property-requests";
import { getPropertyRequestHandler } from "./handlers/get-property-request";
import { getPropertyPaymentHandler } from "./handlers/get-property-payment";
import { payPropertyPaystackHandler } from "./handlers/pay-property-paystack";
import { payPropertyStripeHandler } from "./handlers/pay-property-stripe";

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
 * /api/{version}/client/properties:
 *   get:
 *     tags: [Properties]
 *     summary: Explore properties (search and filters)
 *     description: >
 *       Published properties, newest first. No login needed. meta.totalItems gives the
 *       "N properties match your search" count; an empty data array is "No properties found".
 *     security: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: query, name: search, description: Title, address, area or city, schema: { type: string, example: Lekki } }
 *       - { in: query, name: type, description: The Houses / Apartments / Land / Commercial chips, schema: { type: string, enum: [HOUSE, APARTMENT, LAND, COMMERCIAL] } }
 *       - { in: query, name: minPrice, description: Whole naira, inclusive, schema: { type: integer, example: 50000000 } }
 *       - { in: query, name: maxPrice, description: Whole naira, inclusive, schema: { type: integer, example: 100000000 } }
 *       - { in: query, name: area, description: From GET /client/properties/locations (case-insensitive), schema: { type: string, example: Lekki } }
 *       - { in: query, name: city, description: From GET /client/properties/locations (case-insensitive), schema: { type: string, example: Lagos } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 12 } }
 *     responses:
 *       200:
 *         description: A page of properties.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: '#/components/schemas/AdminDashboardProperty' } }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     totalItems: { type: integer, example: 1 }
 *                     totalPages: { type: integer }
 *       400:
 *         description: Invalid type, price or paging, or minPrice is more than maxPrice
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: minPrice must not be more than maxPrice. }
 *       500: { $ref: '#/components/responses/ClientPropertyServerError' }
 */
router.get("/properties", getPropertiesHandler);

/**
 * @swagger
 * /api/{version}/client/properties/locations:
 *   get:
 *     tags: [Properties]
 *     summary: Locations for the Explore Properties filter
 *     description: Each area and city that has published properties. No login needed.
 *     security: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *     responses:
 *       200:
 *         description: Locations sorted by city, then area.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       area: { type: string, nullable: true, example: Lekki }
 *                       city: { type: string, nullable: true, example: Lagos }
 *                       label: { type: string, example: "Lekki, Lagos" }
 *       500: { $ref: '#/components/responses/ClientPropertyServerError' }
 */
// Before /properties/:id, so "locations" isn't read as a property id.
router.get("/properties/locations", getPropertyLocationsHandler);

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

/**
 * @swagger
 * components:
 *   parameters:
 *     IdempotencyKey:
 *       in: header
 *       name: Idempotency-Key
 *       required: false
 *       description: >
 *         Any unique string (e.g. a UUID) per user action. Repeating it on the same route returns
 *         the first response (with header `Idempotent-Replayed: true`) instead of running again;
 *         a repeat while the first is still running gets 409. Responses with a 5xx aren't saved.
 *       schema: { type: string, maxLength: 255 }
 *   schemas:
 *     PropertyPayment:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         reference: { type: string, example: BF-PAY-203948 }
 *         amount: { type: number, description: The property's listed price, example: 85000000 }
 *         currency: { type: string, example: NGN }
 *         status: { type: string, enum: [READY, PROCESSING, SUCCESSFUL, FAILED], description: 'READY is "Ready to confirm"' }
 *         provider: { type: string, nullable: true, enum: [PAYSTACK, STRIPE] }
 *         method: { type: string, nullable: true, enum: [CARD, BANK_TRANSFER] }
 *         checkoutUrl: { type: string, nullable: true, description: The open checkout to send the client to; only while PROCESSING }
 *         paidAt: { type: string, format: date-time, nullable: true }
 *     PropertyRequest:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         reference: { type: string, example: BF-PUR-203948 }
 *         type: { type: string, enum: [PURCHASE, CONSULTATION] }
 *         status: { type: string, enum: [SUBMITTED, CONSULTATION, IN_PROGRESS, COMPLETED, CANCELLED] }
 *         statusLabel: { type: string, example: Purchase in progress }
 *         steps:
 *           type: array
 *           description: The "Purchase progress" list.
 *           items:
 *             type: object
 *             properties:
 *               status: { type: string, example: CONSULTATION }
 *               label: { type: string, example: Consultation }
 *               done: { type: boolean }
 *               current: { type: boolean }
 *               reachedAt: { type: string, format: date-time, nullable: true }
 *         updates:
 *           type: array
 *           description: '"Purchase Updates": each status change and payment result, oldest first.'
 *           items:
 *             type: object
 *             properties:
 *               status: { type: string }
 *               note: { type: string, nullable: true, example: "Payment of NGN 85,000,000.00 received" }
 *               createdAt: { type: string, format: date-time }
 *         payment:
 *           nullable: true
 *           description: Created when the purchase moves to IN_PROGRESS; null before that and for consultations.
 *           allOf: [{ $ref: '#/components/schemas/PropertyPayment' }]
 *         property:
 *           type: object
 *           description: The "Selected property" card.
 *           properties:
 *             id: { type: string }
 *             title: { type: string, example: Lekki Phase 1 Apartment }
 *             type: { type: string, enum: [HOUSE, APARTMENT, LAND, COMMERCIAL] }
 *             address: { type: string, nullable: true }
 *             location: { type: object, properties: { area: { type: string, nullable: true }, city: { type: string, nullable: true } } }
 *             price: { type: object, properties: { amount: { type: number }, currency: { type: string } } }
 *             bedrooms: { type: integer, nullable: true }
 *             bathrooms: { type: integer, nullable: true }
 *             amenities: { type: array, items: { type: string } }
 *             coverImageUrl: { type: string, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *   responses:
 *     PropertyRequestError:
 *       description: See the message.
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 */

/**
 * @swagger
 * /api/{version}/client/properties/{id}/purchase-requests:
 *   post:
 *     tags: [Property Purchases]
 *     summary: Submit a purchase request ("Purchase Property")
 *     description: >
 *       No payment is taken. If the client already has an open purchase request for this
 *       property, it's returned with 200 instead of creating another.
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Property ID, schema: { type: string } }
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/PropertyRequest' } } } }
 *       200: { description: The open request that already exists, content: { application/json: { schema: { $ref: '#/components/schemas/PropertyRequest' } } } }
 *       401: { $ref: '#/components/responses/PropertyRequestError' }
 *       404: { $ref: '#/components/responses/PropertyRequestError' }
 *       409: { $ref: '#/components/responses/PropertyRequestError' }
 */
router.post(
  "/properties/:id/purchase-requests",
  checkJwt,
  idempotent,
  createPurchaseRequestHandler,
);

/**
 * @swagger
 * /api/{version}/client/properties/{id}/consultations:
 *   post:
 *     tags: [Property Purchases]
 *     summary: Request a consultation ("Request Consultation")
 *     description: >
 *       Bonafide contacts the client using their account details. Returns the open
 *       consultation request for this property with 200 if there is one.
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Property ID, schema: { type: string } }
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/PropertyRequest' } } } }
 *       200: { description: The open request that already exists, content: { application/json: { schema: { $ref: '#/components/schemas/PropertyRequest' } } } }
 *       401: { $ref: '#/components/responses/PropertyRequestError' }
 *       404: { $ref: '#/components/responses/PropertyRequestError' }
 *       409: { $ref: '#/components/responses/PropertyRequestError' }
 */
router.post(
  "/properties/:id/consultations",
  checkJwt,
  idempotent,
  createConsultationRequestHandler,
);

/**
 * @swagger
 * /api/{version}/client/property-requests:
 *   get:
 *     tags: [Property Purchases]
 *     summary: The client's purchase and consultation requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: query, name: type, schema: { type: string, enum: [PURCHASE, CONSULTATION] } }
 *       - { in: query, name: status, schema: { type: string, enum: [SUBMITTED, CONSULTATION, IN_PROGRESS, COMPLETED, CANCELLED] } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *     responses:
 *       200:
 *         description: Newest first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: '#/components/schemas/PropertyRequest' } }
 *                 meta: { type: object, properties: { page: { type: integer }, limit: { type: integer }, totalItems: { type: integer }, totalPages: { type: integer } } }
 *       400: { $ref: '#/components/responses/PropertyRequestError' }
 *       401: { $ref: '#/components/responses/PropertyRequestError' }
 */
router.get("/property-requests", checkJwt, getPropertyRequestsHandler);

/**
 * @swagger
 * /api/{version}/client/property-requests/{id}:
 *   get:
 *     tags: [Property Purchases]
 *     summary: Purchase status ("View purchase status")
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: The request, content: { application/json: { schema: { $ref: '#/components/schemas/PropertyRequest' } } } }
 *       401: { $ref: '#/components/responses/PropertyRequestError' }
 *       404: { $ref: '#/components/responses/PropertyRequestError' }
 */
router.get("/property-requests/:id", checkJwt, getPropertyRequestHandler);

/**
 * @swagger
 * /api/{version}/client/property-requests/{id}/payment:
 *   get:
 *     tags: [Property Purchases]
 *     summary: The purchase payment ("View payment / deposit"); poll it while PROCESSING
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Purchase request ID, schema: { type: string } }
 *     responses:
 *       200: { description: The payment, content: { application/json: { schema: { $ref: '#/components/schemas/PropertyPayment' } } } }
 *       401: { $ref: '#/components/responses/PropertyRequestError' }
 *       404: { $ref: '#/components/responses/PropertyRequestError' }
 */
router.get("/property-requests/:id/payment", checkJwt, getPropertyPaymentHandler);

/**
 * @swagger
 * /api/{version}/client/property-requests/{id}/payment/paystack:
 *   post:
 *     tags: [Property Purchases]
 *     summary: Pay with Paystack, by card or bank transfer ("Confirm payment", "Retry payment")
 *     description: >
 *       Starts a Paystack checkout for the property's listed price and returns its checkoutUrl;
 *       the payment becomes PROCESSING until Paystack's webhook marks it SUCCESSFUL or FAILED.
 *       Calling it again with the same method while the checkout is open returns that checkout.
 *       A new method (or a retry after FAILED) starts a new checkout. Paying doesn't complete
 *       the purchase.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Purchase request ID, schema: { type: string } }
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [method]
 *             properties:
 *               method: { type: string, enum: [CARD, BANK_TRANSFER] }
 *     responses:
 *       200: { description: The payment with its checkoutUrl, content: { application/json: { schema: { $ref: '#/components/schemas/PropertyPayment' } } } }
 *       400: { $ref: '#/components/responses/PropertyRequestError' }
 *       401: { $ref: '#/components/responses/PropertyRequestError' }
 *       404: { $ref: '#/components/responses/PropertyRequestError' }
 *       409:
 *         description: No payment yet (the purchase isn't in progress), already paid, the request is completed or cancelled, or the same Idempotency-Key is still running.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500: { $ref: '#/components/responses/PropertyRequestError' }
 */
router.post(
  "/property-requests/:id/payment/paystack",
  checkJwt,
  idempotent,
  payPropertyPaystackHandler,
);

/**
 * @swagger
 * /api/{version}/client/property-requests/{id}/payment/stripe:
 *   post:
 *     tags: [Property Purchases]
 *     summary: Pay by card with Stripe ("Confirm payment", "Retry payment")
 *     description: >
 *       Like the Paystack endpoint, card only. Stripe caps one payment at 99,999,999 in the
 *       smallest currency unit (₦999,999.99), so larger prices get 400; use Paystack for them.
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Purchase request ID, schema: { type: string } }
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     responses:
 *       200: { description: The payment with its checkoutUrl, content: { application/json: { schema: { $ref: '#/components/schemas/PropertyPayment' } } } }
 *       400: { $ref: '#/components/responses/PropertyRequestError' }
 *       401: { $ref: '#/components/responses/PropertyRequestError' }
 *       404: { $ref: '#/components/responses/PropertyRequestError' }
 *       409: { $ref: '#/components/responses/PropertyRequestError' }
 *       500: { $ref: '#/components/responses/PropertyRequestError' }
 */
router.post(
  "/property-requests/:id/payment/stripe",
  checkJwt,
  idempotent,
  payPropertyStripeHandler,
);

export default router;
