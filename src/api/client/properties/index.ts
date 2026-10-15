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
import { getPropertyDocumentsHandler } from "./handlers/get-property-documents";
import { uploadPropertyDocumentHandler } from "./handlers/upload-property-document";
import { documentUpload } from "../../../middlewares/document-upload";

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
 *       - { in: query, name: search, description: "Title, address, area or city", schema: { type: string, example: Lekki } }
 *       - { in: query, name: type, description: The Houses / Apartments / Land / Commercial chips, schema: { type: string, enum: [HOUSE, APARTMENT, LAND, COMMERCIAL] } }
 *       - { in: query, name: minPrice, description: "Whole naira, inclusive", schema: { type: integer, example: 50000000 } }
 *       - { in: query, name: maxPrice, description: "Whole naira, inclusive", schema: { type: integer, example: 100000000 } }
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
 *         Optional. Any unique string per user action, e.g. a UUID generated when the button is
 *         tapped. Repeating the key on the same route returns the first response (with the
 *         `Idempotent-Replayed: true` header) instead of running the action again. A repeat
 *         while the first is still running gets 409. 5xx responses aren't saved, so the same
 *         key can be retried after a server error. At most 255 characters.
 *       schema: { type: string, maxLength: 255, example: 7f9c2ba4-e88f-4a1b-9c3d-2b7a1f0e5d11 }
 *   schemas:
 *     PropertyPayment:
 *       type: object
 *       description: The one payment for a purchase, for the property's listed price.
 *       required: [id, reference, amount, currency, status, provider, method, checkoutUrl, paidAt]
 *       properties:
 *         id: { type: string, example: cmvb1pay0001 }
 *         reference: { type: string, description: The purchase reference with PAY instead of PUR, example: BF-PAY-203948 }
 *         amount: { type: number, description: In whole naira (the property's listed price), example: 85000000 }
 *         currency: { type: string, example: NGN }
 *         status:
 *           type: string
 *           enum: [READY, PROCESSING, SUCCESSFUL, FAILED]
 *           description: >
 *             READY is "Ready to confirm" (not started); PROCESSING after "Confirm payment", until
 *             the provider's webhook makes it SUCCESSFUL or FAILED. FAILED can be paid again.
 *           example: READY
 *         provider: { type: string, nullable: true, enum: [PAYSTACK, STRIPE], description: Null until the first checkout, example: PAYSTACK }
 *         method: { type: string, nullable: true, enum: [CARD, BANK_TRANSFER], example: CARD }
 *         checkoutUrl:
 *           type: string
 *           nullable: true
 *           description: The open checkout to send the client to; only set while PROCESSING.
 *           example: https://checkout.paystack.com/7h3k2l9xq1
 *         paidAt: { type: string, format: date-time, nullable: true, example: null }
 *     PropertyRequestStep:
 *       type: object
 *       required: [status, label, done, current, reachedAt]
 *       properties:
 *         status: { type: string, enum: [SUBMITTED, CONSULTATION, IN_PROGRESS, OWNERSHIP_TRANSFER, COMPLETED, CANCELLED], example: CONSULTATION }
 *         label: { type: string, example: Consultation }
 *         done: { type: boolean, description: The step is behind the current one (all are done once COMPLETED) }
 *         current: { type: boolean }
 *         reachedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: When the request moved to this step; null if it hasn't, or if an admin skipped it.
 *     PropertyRequestUpdate:
 *       type: object
 *       description: One "Purchase Update Status" card.
 *       required: [status, kind, title, message, createdAt]
 *       properties:
 *         status: { type: string, enum: [SUBMITTED, CONSULTATION, IN_PROGRESS, OWNERSHIP_TRANSFER, COMPLETED, CANCELLED], description: The request's status at the time }
 *         kind:
 *           type: string
 *           enum: [PROGRESS, MILESTONE, NOTICE]
 *           description: >
 *             The card's label: PROGRESS "Progress update" (IN_PROGRESS, OWNERSHIP_TRANSFER, payment
 *             results), MILESTONE "Milestone notification" (SUBMITTED, CONSULTATION, COMPLETED,
 *             CANCELLED), NOTICE "Important notice" (posted by an admin).
 *           example: PROGRESS
 *         title: { type: string, example: Purchase in progress }
 *         message:
 *           type: string
 *           description: The admin's note or notice, a payment result, or a standard message for the status.
 *           example: Bonafide is facilitating your purchase of Lekki Phase 1 Apartment.
 *         createdAt: { type: string, format: date-time }
 *     PropertyRequest:
 *       type: object
 *       description: A purchase or consultation request, with everything the status screens show.
 *       required: [id, reference, type, status, statusLabel, steps, updates, payment, property, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, example: cmvb1req0001 }
 *         reference: { type: string, description: "BF-PUR-… for purchases, BF-CON-… for consultations", example: BF-PUR-203948 }
 *         type: { type: string, enum: [PURCHASE, CONSULTATION] }
 *         status:
 *           type: string
 *           enum: [SUBMITTED, CONSULTATION, IN_PROGRESS, OWNERSHIP_TRANSFER, COMPLETED, CANCELLED]
 *           description: Set to SUBMITTED by the client, then moved only by an admin. Consultations skip IN_PROGRESS and OWNERSHIP_TRANSFER.
 *         statusLabel: { type: string, description: The badge text, example: Purchase in progress }
 *         steps:
 *           type: array
 *           description: >
 *             The "Purchase progress" list: SUBMITTED, CONSULTATION, IN_PROGRESS,
 *             OWNERSHIP_TRANSFER, COMPLETED for a purchase (SUBMITTED, CONSULTATION, COMPLETED for a
 *             consultation); CANCELLED replaces COMPLETED when cancelled.
 *           items: { $ref: '#/components/schemas/PropertyRequestStep' }
 *         updates:
 *           type: array
 *           description: '"Purchase Updates": every status change, payment result and admin notice, oldest first (show them newest first).'
 *           items: { $ref: '#/components/schemas/PropertyRequestUpdate' }
 *         documentCount: { type: integer, description: Documents on the request (shared and submitted), example: 2 }
 *         payment:
 *           type: object
 *           nullable: true
 *           description: Created when an admin moves a purchase to IN_PROGRESS; null before that and always for consultations.
 *           allOf: [{ $ref: '#/components/schemas/PropertyPayment' }]
 *         property:
 *           type: object
 *           description: The "Selected property" card.
 *           required: [id, title, type, address, location, price, bedrooms, bathrooms, amenities, coverImageUrl]
 *           properties:
 *             id: { type: string }
 *             title: { type: string, example: Lekki Phase 1 Apartment }
 *             type: { type: string, enum: [HOUSE, APARTMENT, LAND, COMMERCIAL] }
 *             address: { type: string, nullable: true, example: "Lekki Phase 1, Lagos" }
 *             location:
 *               type: object
 *               properties:
 *                 area: { type: string, nullable: true, example: Lekki Phase 1 }
 *                 city: { type: string, nullable: true, example: Lagos }
 *             price:
 *               type: object
 *               properties:
 *                 amount: { type: number, example: 85000000 }
 *                 currency: { type: string, example: NGN }
 *             bedrooms: { type: integer, nullable: true, example: 3 }
 *             bathrooms: { type: integer, nullable: true, example: 3 }
 *             amenities: { type: array, items: { type: string }, example: [PARKING] }
 *             coverImageUrl: { type: string, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *       example:
 *         id: cmvb1req0001
 *         reference: BF-PUR-203948
 *         type: PURCHASE
 *         status: IN_PROGRESS
 *         statusLabel: Purchase in progress
 *         steps:
 *           - { status: SUBMITTED, label: Request submitted, done: true, current: false, reachedAt: "2026-10-16T09:00:00.000Z" }
 *           - { status: CONSULTATION, label: Consultation, done: true, current: false, reachedAt: "2026-10-16T11:30:00.000Z" }
 *           - { status: IN_PROGRESS, label: Purchase in progress, done: false, current: true, reachedAt: "2026-10-17T10:00:00.000Z" }
 *           - { status: OWNERSHIP_TRANSFER, label: Ownership transfer, done: false, current: false, reachedAt: null }
 *           - { status: COMPLETED, label: Completed, done: false, current: false, reachedAt: null }
 *         updates:
 *           - { status: SUBMITTED, kind: MILESTONE, title: Request submitted, message: Your purchase request for Lekki Phase 1 Apartment was received., createdAt: "2026-10-16T09:00:00.000Z" }
 *           - { status: CONSULTATION, kind: MILESTONE, title: Consultation, message: Consultation call booked, createdAt: "2026-10-16T11:30:00.000Z" }
 *           - { status: IN_PROGRESS, kind: PROGRESS, title: Purchase in progress, message: Bonafide is facilitating your purchase of Lekki Phase 1 Apartment., createdAt: "2026-10-17T10:00:00.000Z" }
 *           - { status: IN_PROGRESS, kind: NOTICE, title: Purchase notice, message: Bonafide will communicate any requested documents for this purchase., createdAt: "2026-10-17T12:00:00.000Z" }
 *         documentCount: 1
 *         payment:
 *           { id: cmvb1pay0001, reference: BF-PAY-203948, amount: 85000000, currency: NGN, status: READY, provider: null, method: null, checkoutUrl: null, paidAt: null }
 *         property:
 *           id: cmv1prop0001
 *           title: Lekki Phase 1 Apartment
 *           type: APARTMENT
 *           address: "Lekki Phase 1, Lagos"
 *           location: { area: Lekki Phase 1, city: Lagos }
 *           price: { amount: 85000000, currency: NGN }
 *           bedrooms: 3
 *           bathrooms: 3
 *           amenities: [PARKING]
 *           coverImageUrl: https://res.cloudinary.com/demo/image/upload/lekki.jpg
 *         createdAt: "2026-10-16T09:00:00.000Z"
 *         updatedAt: "2026-10-17T10:00:00.000Z"
 *     PropertyRequestPage:
 *       type: object
 *       required: [data, meta]
 *       properties:
 *         data: { type: array, items: { $ref: '#/components/schemas/PropertyRequest' } }
 *         meta:
 *           type: object
 *           required: [page, limit, totalItems, totalPages]
 *           properties:
 *             page: { type: integer, example: 1 }
 *             limit: { type: integer, example: 20 }
 *             totalItems: { type: integer, example: 1 }
 *             totalPages: { type: integer, example: 1 }
 *     PropertyDocument:
 *       type: object
 *       description: A purchase document, stored privately; open it only through the signed links.
 *       required: [id, name, source, status, fileName, fileType, fileSizeBytes, viewUrl, downloadUrl, linksExpireAt, createdAt]
 *       properties:
 *         id: { type: string, example: cmvb1doc0001 }
 *         name: { type: string, example: Property purchase document }
 *         source: { type: string, enum: [BONAFIDE, CLIENT], description: BONAFIDE is shared by an admin; CLIENT was uploaded by the client }
 *         status: { type: string, enum: [Available, Submitted], description: The label under the name }
 *         fileName: { type: string, example: deed-of-assignment.pdf }
 *         fileType: { type: string, enum: [PDF, JPG, PNG], example: PDF }
 *         fileSizeBytes: { type: integer, example: 245760 }
 *         viewUrl: { type: string, description: '"View": opens the file. Signed; expires at linksExpireAt.' }
 *         downloadUrl: { type: string, description: '"Download": saves the file. Signed; expires at linksExpireAt.' }
 *         linksExpireAt: { type: string, format: date-time, description: 15 minutes after the response; fetch the documents again for new links }
 *         createdAt: { type: string, format: date-time }
 *     PropertyDocuments:
 *       type: object
 *       required: [available, submitted]
 *       properties:
 *         available:
 *           type: array
 *           description: '"Available documents": shared by Bonafide, oldest first.'
 *           items: { $ref: '#/components/schemas/PropertyDocument' }
 *         submitted:
 *           type: array
 *           description: '"Submitted documents": uploaded by the client, oldest first.'
 *           items: { $ref: '#/components/schemas/PropertyDocument' }
 *     PropertyDocumentUpload:
 *       type: object
 *       required: [file]
 *       properties:
 *         file: { type: string, format: binary, description: "PDF, JPG or PNG, up to 10 MB" }
 *         name: { type: string, maxLength: 120, description: Shown as the document's title; defaults to the file name without its extension, example: Signed offer letter }
 *   responses:
 *     PropertyDocumentUploadInvalid:
 *       description: >
 *         No file (`Attach the document in the file field.`), a file that isn't PDF, JPG or PNG
 *         (`Documents must be PDF, JPG or PNG.`), over 10 MB (`Documents must be at most 10 MB.`),
 *         or a bad name (`name must be a string.` / `name must be at most 120 characters.`).
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *           example: { status: error, message: "Documents must be PDF, JPG or PNG." }
 *     PropertyRequestUnauthorized:
 *       description: "No token (`No token provided`), or the token is invalid (`Invalid token`), expired (`Token expired`), malformed (`Malformed token`) or for a user that no longer exists (`User not found`)."
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *           example: { status: error, message: Invalid token }
 *     PropertyRequestSuspended:
 *       description: "The client's account is suspended (`Your account has been suspended.`)."
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *           example: { status: error, message: Your account has been suspended. }
 *     PropertyRequestServerError:
 *       description: "Unexpected database error (`Internal server error.`)."
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ErrorResponse' }
 *           example: { status: error, message: Internal server error. }
 */

/**
 * @swagger
 * /api/{version}/client/properties/{id}/purchase-requests:
 *   post:
 *     tags: [Property Purchases]
 *     summary: Submit a purchase request ("Purchase Property")
 *     description: >
 *       Asks Bonafide to help buy the property; no payment is taken. The request starts as
 *       SUBMITTED with no payment. A client has one open (not COMPLETED or CANCELLED) purchase
 *       request per property: submitting again returns that request with 200 instead of
 *       creating another.
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Property ID (a published property), schema: { type: string } }
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     responses:
 *       201:
 *         description: The new purchase request (status SUBMITTED, payment null).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PropertyRequest' }
 *       200:
 *         description: The client already has an open purchase request for this property; it's returned unchanged.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PropertyRequest' }
 *       400:
 *         description: "The Idempotency-Key header is over 255 characters (`Idempotency-Key must be at most 255 characters.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401: { $ref: '#/components/responses/PropertyRequestUnauthorized' }
 *       403: { $ref: '#/components/responses/PropertyRequestSuspended' }
 *       404:
 *         description: "No published, undeleted property has this ID (`Property not found.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Property not found. }
 *       409:
 *         description: "The same Idempotency-Key is still being processed (`A request with this Idempotency-Key is still being processed.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500: { $ref: '#/components/responses/PropertyRequestServerError' }
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
 *       Asks a Bonafide real estate professional to contact the client about the property,
 *       using the contact details on their account; there's no body. Works alongside a purchase
 *       request. One open consultation per property: requesting again returns it with 200.
 *       Consultations go SUBMITTED → CONSULTATION → COMPLETED and never have a payment.
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Property ID (a published property), schema: { type: string } }
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     responses:
 *       201:
 *         description: The new consultation request (reference BF-CON-…, status SUBMITTED).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PropertyRequest' }
 *       200:
 *         description: The client already has an open consultation for this property; it's returned unchanged.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PropertyRequest' }
 *       400:
 *         description: "The Idempotency-Key header is over 255 characters (`Idempotency-Key must be at most 255 characters.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401: { $ref: '#/components/responses/PropertyRequestUnauthorized' }
 *       403: { $ref: '#/components/responses/PropertyRequestSuspended' }
 *       404:
 *         description: "No published, undeleted property has this ID (`Property not found.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Property not found. }
 *       409:
 *         description: "The same Idempotency-Key is still being processed (`A request with this Idempotency-Key is still being processed.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500: { $ref: '#/components/responses/PropertyRequestServerError' }
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
 *     description: Only the signed-in client's own requests, newest first.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: query, name: type, required: false, description: Only purchases or only consultations, schema: { type: string, enum: [PURCHASE, CONSULTATION] } }
 *       - { in: query, name: status, required: false, schema: { type: string, enum: [SUBMITTED, CONSULTATION, IN_PROGRESS, OWNERSHIP_TRANSFER, COMPLETED, CANCELLED] } }
 *       - { in: query, name: page, required: false, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, required: false, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *     responses:
 *       200:
 *         description: A page of requests; data is empty when there are none.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PropertyRequestPage' }
 *       400:
 *         description: >
 *           A bad query value: `page and limit must be positive integers (limit ≤ 100).`,
 *           `type must be PURCHASE or CONSULTATION.` or
 *           `status must be one of SUBMITTED, CONSULTATION, IN_PROGRESS, OWNERSHIP_TRANSFER, COMPLETED, CANCELLED.`
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401: { $ref: '#/components/responses/PropertyRequestUnauthorized' }
 *       403: { $ref: '#/components/responses/PropertyRequestSuspended' }
 *       500: { $ref: '#/components/responses/PropertyRequestServerError' }
 */
router.get("/property-requests", checkJwt, getPropertyRequestsHandler);

/**
 * @swagger
 * /api/{version}/client/property-requests/{id}:
 *   get:
 *     tags: [Property Purchases]
 *     summary: Purchase status ("View purchase status")
 *     description: >
 *       The status screen: badge, progress steps, "Purchase Updates", the payment (once the
 *       purchase is IN_PROGRESS) and the selected property. Only the client's own requests.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Purchase or consultation request ID, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The request.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PropertyRequest' }
 *       401: { $ref: '#/components/responses/PropertyRequestUnauthorized' }
 *       403: { $ref: '#/components/responses/PropertyRequestSuspended' }
 *       404:
 *         description: "No request with this ID belongs to the client (`Purchase request not found.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Purchase request not found. }
 *       500: { $ref: '#/components/responses/PropertyRequestServerError' }
 */
router.get("/property-requests/:id", checkJwt, getPropertyRequestHandler);

/**
 * @swagger
 * /api/{version}/client/property-requests/{id}/payment:
 *   get:
 *     tags: [Property Purchases]
 *     summary: The purchase payment ("View payment / deposit")
 *     description: >
 *       The Payment screens: "Ready to confirm" (READY), "processing" (PROCESSING), "confirmed"
 *       (SUCCESSFUL) or "not successful" (FAILED). Poll it after sending the client to the
 *       checkout; the provider's webhook updates it.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Purchase request ID, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The payment.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PropertyPayment' }
 *       401: { $ref: '#/components/responses/PropertyRequestUnauthorized' }
 *       403: { $ref: '#/components/responses/PropertyRequestSuspended' }
 *       404:
 *         description: >
 *           No request with this ID belongs to the client (`Purchase request not found.`), or it
 *           has no payment yet because it isn't IN_PROGRESS or is a consultation
 *           (`No payment is ready for this purchase yet.`).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500: { $ref: '#/components/responses/PropertyRequestServerError' }
 */
router.get("/property-requests/:id/payment", checkJwt, getPropertyPaymentHandler);

/**
 * @swagger
 * /api/{version}/client/property-requests/{id}/payment/paystack:
 *   post:
 *     tags: [Property Purchases]
 *     summary: Pay with Paystack by card or bank transfer ("Confirm payment", "Retry payment")
 *     description: >
 *       Starts a Paystack checkout for the property's listed price and returns the payment with
 *       its checkoutUrl; send the client there. The payment becomes PROCESSING until Paystack's
 *       webhook makes it SUCCESSFUL or FAILED. A successful payment doesn't complete the
 *       purchase: it stays IN_PROGRESS and an update records the payment.
 *
 *       While the checkout is open, calling again with the same method returns the same
 *       checkout. A different method ("Change payment method") or a retry after FAILED starts a
 *       new checkout. Send an Idempotency-Key so a double-tapped "Confirm payment" can't start two.
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
 *               method: { type: string, enum: [CARD, BANK_TRANSFER], description: BANK_TRANSFER shows a Paystack account to pay into }
 *           example: { method: CARD }
 *     responses:
 *       200:
 *         description: The payment, PROCESSING, with its checkoutUrl.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PropertyPayment' }
 *             example: { id: cmvb1pay0001, reference: BF-PAY-203948, amount: 85000000, currency: NGN, status: PROCESSING, provider: PAYSTACK, method: CARD, checkoutUrl: "https://checkout.paystack.com/7h3k2l9xq1", paidAt: null }
 *       400:
 *         description: "method is missing or not CARD or BANK_TRANSFER (`method must be CARD or BANK_TRANSFER.`), or the Idempotency-Key is over 255 characters."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401: { $ref: '#/components/responses/PropertyRequestUnauthorized' }
 *       403: { $ref: '#/components/responses/PropertyRequestSuspended' }
 *       404:
 *         description: "No purchase request with this ID belongs to the client (`Purchase request not found.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: >
 *           The payment can't be made now: it isn't open yet
 *           (`No payment is ready yet. Bonafide opens the payment once your purchase is in progress.`),
 *           it's already paid (`This purchase has already been paid for.`), the request is finished
 *           (`This purchase is completed.` / `This purchase is cancelled.`), or the same
 *           Idempotency-Key is still being processed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: "Paystack or the database failed (`Unable to start the payment.`); the reason is in the server log."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
 *       Like the Paystack endpoint, card only and with no body. Stripe caps a single payment at
 *       99,999,999 in the currency's smallest unit (₦999,999.99), so larger prices get 400 and
 *       must be paid with Paystack. While the Stripe checkout is open, calling again returns it.
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Purchase request ID, schema: { type: string } }
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     responses:
 *       200:
 *         description: The payment, PROCESSING, with its Stripe checkoutUrl.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PropertyPayment' }
 *             example: { id: cmvb1pay0001, reference: BF-PAY-203948, amount: 500000, currency: NGN, status: PROCESSING, provider: STRIPE, method: CARD, checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_a1b2", paidAt: null }
 *       400:
 *         description: "The price is above Stripe's limit (`This amount is above Stripe's limit for a single payment. Pay with Paystack instead.`), or the Idempotency-Key is over 255 characters."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401: { $ref: '#/components/responses/PropertyRequestUnauthorized' }
 *       403: { $ref: '#/components/responses/PropertyRequestSuspended' }
 *       404:
 *         description: "No purchase request with this ID belongs to the client (`Purchase request not found.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: "The payment isn't open yet, is already paid, the request is completed or cancelled, or the same Idempotency-Key is still being processed (same messages as the Paystack endpoint)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: "Stripe or the database failed (`Unable to start the payment.`); the reason is in the server log."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(
  "/property-requests/:id/payment/stripe",
  checkJwt,
  idempotent,
  payPropertyStripeHandler,
);

/**
 * @swagger
 * /api/{version}/client/property-requests/{id}/documents:
 *   get:
 *     tags: [Property Purchases]
 *     summary: Purchase documents ("Legal Documentation", "View purchase documents")
 *     description: >
 *       Documents Bonafide shared ("Available documents") and documents the client uploaded
 *       ("Submitted documents"). Files are private in Cloudinary: each comes with View and
 *       Download links signed for 15 minutes, so fetch this again rather than storing the links.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Purchase or consultation request ID, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The documents; both lists can be empty.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PropertyDocuments' }
 *       401: { $ref: '#/components/responses/PropertyRequestUnauthorized' }
 *       403: { $ref: '#/components/responses/PropertyRequestSuspended' }
 *       404:
 *         description: "No request with this ID belongs to the client (`Purchase request not found.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500: { $ref: '#/components/responses/PropertyRequestServerError' }
 *   post:
 *     tags: [Property Purchases]
 *     summary: Upload a purchase document ("Choose document to upload")
 *     description: >
 *       Adds a document to "Submitted documents". Clients can upload at any time, whatever the
 *       request's status. Stored privately in Cloudinary. Documents can't be deleted.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Purchase or consultation request ID, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema: { $ref: '#/components/schemas/PropertyDocumentUpload' }
 *     responses:
 *       201:
 *         description: The uploaded document, with signed links.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PropertyDocument' }
 *       400: { $ref: '#/components/responses/PropertyDocumentUploadInvalid' }
 *       401: { $ref: '#/components/responses/PropertyRequestUnauthorized' }
 *       403: { $ref: '#/components/responses/PropertyRequestSuspended' }
 *       404:
 *         description: "No request with this ID belongs to the client (`Purchase request not found.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: "Cloudinary or the database failed (`Unable to upload the document.`)."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/property-requests/:id/documents", checkJwt, getPropertyDocumentsHandler);
router.post(
  "/property-requests/:id/documents",
  checkJwt,
  documentUpload,
  uploadPropertyDocumentHandler,
);

export default router;
