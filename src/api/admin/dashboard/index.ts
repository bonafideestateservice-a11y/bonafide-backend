import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { checkIsAdmin } from "../../../middlewares/check-roles";
import { getAllPropertiesHandler } from "./handlers/get-all-properties";
import { getDashboardStatsHandler } from "./handlers/get-dashboard-stats";
import { getVerificationRequestsHandler } from "./handlers/get-verification-requests";
import { publishPropertyHandler } from "./handlers/publish-property";
import { getAllActivitiesHandler } from "./handlers/get-all-activities";
import { getDashboardAnalyticsHandler } from "./handlers/get-dashboard-analytics";
import { getAgentsHandler } from "./handlers/get-agents";
import { updateAgentStatusHandler } from "./handlers/update-agent-status";
import { createPropertyHandler, propertyImagesUpload } from "./handlers/create-property";
import { getVerificationRequestHandler } from "./handlers/get-verification-request";
import { getPropertyHandler } from "./handlers/get-property";
import { updatePropertyHandler } from "./handlers/update-property";
import { deletePropertyHandler } from "./handlers/delete-property";
import { getUsersHandler } from "./handlers/get-users";
import { getUserHandler } from "./handlers/get-user";
import { updateUserStatusHandler } from "./handlers/update-user-status";
import { getAgentHandler } from "./handlers/get-agent";
import { assignPropertyAgentHandler } from "./handlers/assign-property-agent";
import { unassignPropertyAgentHandler } from "./handlers/unassign-property-agent";
import {
  getNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from "./handlers/get-notifications";

const router = Router();

/**
 * @swagger
 * components:
 *   responses:
 *     AdminDashboardBadRequest:
 *       description: Invalid query parameter.
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *     AdminDashboardUnauthorized:
 *       description: Missing, invalid or expired token.
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *     AdminDashboardForbidden:
 *       description: The authenticated user is not an ADMIN.
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *     AdminDashboardNotFound:
 *       description: Not found.
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *     AdminDashboardServerError:
 *       description: Unexpected server error.
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminDashboardStats:
 *       type: object
 *       required: [totalUsers, numberOfPendingRequest, numberOfActiveAgents, numberOfProperties, trends, comparedTo]
 *       properties:
 *         totalUsers:
 *           type: integer
 *           description: Number of users with role CLIENT.
 *           example: 128
 *         numberOfPendingRequest:
 *           type: integer
 *           description: Number of verification requests with status SUBMITTED.
 *           example: 7
 *         numberOfActiveAgents:
 *           type: integer
 *           description: Number of verification agents whose status is ACTIVE.
 *           example: 12
 *         numberOfProperties:
 *           type: integer
 *           description: Number of properties with status VERIFIED (not the total number of properties).
 *           example: 45
 *         trends:
 *           type: object
 *           description: >
 *             % change of each card vs exactly 7 days ago, rounded to one decimal; null when the
 *             value 7 days ago was 0. Pending requests = paid requests waiting for an agent.
 *           properties:
 *             totalUsers: { type: number, nullable: true, example: 8 }
 *             numberOfPendingRequest: { type: number, nullable: true, example: 6 }
 *             numberOfActiveAgents: { type: number, nullable: true, example: -2 }
 *             numberOfProperties: { type: number, nullable: true, example: 6 }
 *         comparedTo: { type: string, enum: [last_week], example: last_week }
 *     AdminDashboardActivity:
 *       type: object
 *       description: >
 *         One event in the Recent activity feed. The frontend builds the title and description
 *         from type and the fields below. Rows recorded before 13 Oct 2026 have no clientName,
 *         agentName or amount.
 *       required: [id, type, subjectName, verificationRequestId, createdAt]
 *       properties:
 *         id: { type: string, example: cmg6act01 }
 *         type:
 *           type: string
 *           enum: [VERIFICATION_REQUEST_CREATED, PAYMENT_RECEIVED, AGENT_ASSIGNED, INSPECTION_STARTED, REPORT_UPLOADED, PROPERTY_ADDED]
 *           example: AGENT_ASSIGNED
 *         subjectName:
 *           type: string
 *           description: The agent (assignment, inspection, report), the client (new request, payment) or the property title (PROPERTY_ADDED).
 *           example: Emma Wilson
 *         clientName: { type: string, nullable: true, description: "The name shown under the row: the client, or for PROPERTY_ADDED the admin who added it", example: Michael Brown }
 *         agentName: { type: string, nullable: true, description: Assignment, inspection and report rows, example: Emma Wilson }
 *         amount: { type: number, nullable: true, description: PAYMENT_RECEIVED only, in naira, example: 75000 }
 *         verificationType: { type: string, nullable: true, example: Land Verification }
 *         status:
 *           type: string
 *           nullable: true
 *           description: The request's current status, as on the verification requests list; null for PROPERTY_ADDED.
 *           enum: [PENDING, ASSIGNED, IN_PROGRESS, AWAITING_RENEWAL, COMPLETED, CANCELLED, PAYMENT_FAILED]
 *           example: IN_PROGRESS
 *         verificationRequestId: { type: string, nullable: true, example: cmg4x2k1p0001 }
 *         property:
 *           type: object
 *           nullable: true
 *           description: PROPERTY_ADDED only.
 *           properties:
 *             id: { type: string }
 *             title: { type: string, example: 4 Bedroom Duplex }
 *         createdAt: { type: string, format: date-time }
 *     AdminDashboardPaginationMeta:
 *       type: object
 *       required: [page, limit, totalItems, totalPages]
 *       properties:
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 10
 *         totalItems:
 *           type: integer
 *           description: Number of items matching all filters.
 *           example: 42
 *         totalPages:
 *           type: integer
 *           description: ceil(totalItems / limit); 0 when there are no items.
 *           example: 5
 *     AdminDashboardVerificationRequest:
 *       type: object
 *       required: [id, client, propertyType, location, status, agent, createdAt]
 *       properties:
 *         id:
 *           type: string
 *           example: cm1verificationrequest01
 *         client:
 *           type: object
 *           required: [id, name, avatarUrl]
 *           properties:
 *             id:
 *               type: string
 *               example: cm1user0001
 *             name:
 *               type: string
 *               description: The user's fullName.
 *               example: Jane Doe
 *             avatarUrl:
 *               type: string
 *               nullable: true
 *               description: The user's profilePhoto.
 *               example: https://cdn.example.com/avatars/jane.png
 *         propertyType:
 *           type: string
 *           description: details.propertyType when it is a string, otherwise the verification type's name.
 *           example: Residential
 *         location:
 *           type: object
 *           required: [city, country]
 *           description: Taken from details.location.{city,country}, else details.city + details.country, else the first string of details.propertyAddress / constructionAddress / businessAddress split on its first comma.
 *           properties:
 *             city:
 *               type: string
 *               nullable: true
 *               example: Lagos
 *             country:
 *               type: string
 *               nullable: true
 *               example: Nigeria
 *         status:
 *           type: string
 *           description: >
 *             Display status, not the raw VerificationStatus. ASSIGNED when the agent assignment is ASSIGNED;
 *             otherwise PENDING for DRAFT, PENDING_PAYMENT and SUBMITTED; IN_PROGRESS for IN_PROGRESS or an
 *             assignment that is ACCEPTED or INSPECTION_SCHEDULED; otherwise the raw status
 *             (PAYMENT_FAILED, AWAITING_RENEWAL, COMPLETED, CANCELLED).
 *           enum: [PENDING, ASSIGNED, IN_PROGRESS, PAYMENT_FAILED, AWAITING_RENEWAL, COMPLETED, CANCELLED]
 *           example: ASSIGNED
 *         agent:
 *           type: object
 *           nullable: true
 *           description: The assigned agent, or null when the request has no assignment.
 *           required: [id, name]
 *           properties:
 *             id:
 *               type: string
 *               example: cm1agent0001
 *             name:
 *               type: string
 *               example: John Agent
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-28T14:05:00.000Z"
 *     AdminDashboardVerificationRequestList:
 *       type: object
 *       required: [data, meta, counts]
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AdminDashboardVerificationRequest'
 *         meta:
 *           $ref: '#/components/schemas/AdminDashboardPaginationMeta'
 *         counts:
 *           type: object
 *           description: Per-tab totals. They honour search, agentId, userId and propertyType but ignore the status filter.
 *           required: [all, pending, assigned, inProgress, completed]
 *           properties:
 *             all:
 *               type: integer
 *               example: 42
 *             pending:
 *               type: integer
 *               description: Requests with status SUBMITTED.
 *               example: 7
 *             assigned:
 *               type: integer
 *               description: Requests whose agent assignment is ASSIGNED.
 *               example: 5
 *             inProgress:
 *               type: integer
 *               description: Requests IN_PROGRESS or whose assignment is ACCEPTED or INSPECTION_SCHEDULED.
 *               example: 10
 *             completed:
 *               type: integer
 *               description: Requests with status COMPLETED.
 *               example: 20
 *     AdminDashboardProperty:
 *       type: object
 *       required: [id, number, title, type, location, price, viewCount, coverImageUrl, isPublished, createdAt]
 *       properties:
 *         agent:
 *           type: object
 *           nullable: true
 *           description: The agent assigned with "Assign Property". Only on GET /admin/properties and GET /admin/properties/{id}.
 *           properties:
 *             id: { type: string }
 *             name: { type: string, example: Kingsley Wilson }
 *         id:
 *           type: string
 *           example: cm1property0001
 *         number: { type: integer, description: 'Short public ID; show it as "#000001"', example: 1 }
 *         title:
 *           type: string
 *           description: The property's title (stored in Property.name).
 *           example: 3 Bedroom Flat in Lekki
 *         address: { type: string, description: The location as entered, example: "Lekki Phase 1, Lagos" }
 *         type:
 *           type: string
 *           enum: [RESIDENTIAL, COMMERCIAL, LAND]
 *           example: RESIDENTIAL
 *         location:
 *           type: object
 *           required: [area, city, country]
 *           properties:
 *             area:
 *               type: string
 *               nullable: true
 *               example: Lekki Phase 1
 *             city:
 *               type: string
 *               nullable: true
 *               example: Lagos
 *             country:
 *               type: string
 *               nullable: true
 *               example: Nigeria
 *         price:
 *           type: object
 *           required: [amount, currency]
 *           properties:
 *             amount:
 *               type: integer
 *               description: Price in whole naira.
 *               example: 85000000
 *             currency:
 *               type: string
 *               example: NGN
 *         description: { type: string, nullable: true }
 *         bedrooms: { type: integer, nullable: true, example: 4 }
 *         bathrooms: { type: integer, nullable: true, example: 3 }
 *         sizeSqm: { type: number, nullable: true, description: Floor area in square metres, example: 350.5 }
 *         yearBuilt: { type: integer, nullable: true, example: 2024 }
 *         amenities:
 *           type: array
 *           items: { $ref: '#/components/schemas/AdminDashboardAmenity' }
 *         imageUrls:
 *           type: array
 *           description: Other images (up to 4)
 *           items: { type: string, format: uri }
 *         viewCount:
 *           type: integer
 *           example: 312
 *         coverImageUrl:
 *           type: string
 *           nullable: true
 *           example: https://cdn.example.com/properties/lekki.jpg
 *         isPublished:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T10:00:00.000Z"
 *     AdminDashboardAmenity:
 *       type: string
 *       enum: [SWIMMING_POOL, PARKING, SECURITY, GENERATOR, GARDEN, GYM, AIR_CONDITIONING, ELEVATOR]
 *     AdminDashboardPropertyList:
 *       type: object
 *       required: [data, meta, counts]
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AdminDashboardProperty'
 *         meta:
 *           $ref: '#/components/schemas/AdminDashboardPaginationMeta'
 *         counts:
 *           type: object
 *           description: Per-tab totals. They honour search and type but ignore the status filter.
 *           required: [all, published, unpublished]
 *           properties:
 *             all:
 *               type: integer
 *               example: 30
 *             published:
 *               type: integer
 *               example: 18
 *             unpublished:
 *               type: integer
 *               example: 12
 *     AdminDashboardPropertyAgent:
 *       type: object
 *       properties:
 *         id: { type: string, description: Property ID }
 *         agent:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string }
 *             name: { type: string, example: Kingsley Wilson }
 *         updatedAt: { type: string, format: date-time }
 *     AdminDashboardPublishResult:
 *       type: object
 *       required: [id, isPublished, updatedAt]
 *       properties:
 *         id:
 *           type: string
 *           example: cm1property0001
 *         isPublished:
 *           type: boolean
 *           description: The new publication state (the previous value inverted).
 *           example: true
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-10-07T08:12:00.000Z"
 */

/**
 * @swagger
 * /api/{version}/admin/dashboard/stats:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: Get dashboard statistics
 *     description: Returns headline counts for the admin dashboard. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     responses:
 *       200:
 *         description: Dashboard statistics (the object is returned directly, without an envelope).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminDashboardStats'
 *       401:
 *         description: No token, an invalid, expired or malformed token, or the token's user no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: No token provided }
 *       403:
 *         description: The authenticated user is not an ADMIN.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Insufficient permissions. Admin access required. }
 *       500:
 *         description: A database query failed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Internal server error. }
 */
router.get("/dashboard/stats", checkJwt, checkIsAdmin, getDashboardStatsHandler);

/**
 * @swagger
 * /api/{version}/admin/dashboard/activities:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: Recent activity feed
 *     description: Events (new requests, payments, assignments, inspections, reports, properties added), newest first. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *     responses:
 *       200:
 *         description: A page of activity.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: '#/components/schemas/AdminDashboardActivity' } }
 *                 meta: { $ref: '#/components/schemas/AdminDashboardPaginationMeta' }
 *       400: { $ref: '#/components/responses/AdminDashboardBadRequest' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.get("/dashboard/activities", checkJwt, checkIsAdmin, getAllActivitiesHandler);

/**
 * @swagger
 * /api/{version}/admin/verification-requests:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: List verification requests for the dashboard
 *     description: >
 *       Paginated list of all verification requests with per-tab counts. Each item's status is a
 *       display status (see AdminDashboardVerificationRequest.status). Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: query
 *         name: status
 *         required: false
 *         description: >
 *           Tab filter. pending = status SUBMITTED; assigned = assignment ASSIGNED; in_progress = status
 *           IN_PROGRESS or assignment ACCEPTED/INSPECTION_SCHEDULED; completed = status COMPLETED; all = no filter.
 *         schema: { type: string, enum: [all, pending, assigned, in_progress, completed], default: all }
 *       - in: query
 *         name: search
 *         required: false
 *         description: Case-insensitive match on the client's full name or verification type name; case-sensitive substring match on details.propertyAddress, constructionAddress or businessAddress. Trimmed; empty means no search.
 *         schema: { type: string }
 *       - in: query
 *         name: agentId
 *         required: false
 *         description: Only requests assigned to this verification agent.
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         required: false
 *         description: Only this client's requests (User Management "Request History").
 *         schema: { type: string }
 *       - in: query
 *         name: propertyType
 *         required: false
 *         description: Exact match on details.propertyType.
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *       - in: query
 *         name: sortBy
 *         required: false
 *         description: status sorts by the raw VerificationStatus, not the display status.
 *         schema: { type: string, enum: [createdAt, status], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         required: false
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Paginated verification requests.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminDashboardVerificationRequestList'
 *       400:
 *         description: >
 *           A query parameter is invalid - status, sortBy or sortOrder not in its enum, page or limit
 *           not a positive integer, limit above 100, or a parameter given more than once (array).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: "Status must be one of: all, pending, assigned, in_progress, completed." }
 *       401:
 *         description: No token, an invalid, expired or malformed token, or the token's user no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Token expired }
 *       403:
 *         description: The authenticated user is not an ADMIN.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Insufficient permissions. Admin access required. }
 *       500:
 *         description: A database query failed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Internal server error. }
 */
router.get("/verification-requests", checkJwt, checkIsAdmin, getVerificationRequestsHandler);

/**
 * @swagger
 * /api/{version}/admin/properties:
 *   get:
 *     tags: [Properties]
 *     summary: List properties
 *     description: Paginated list of properties with per-tab counts. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: query
 *         name: status
 *         required: false
 *         description: Filter on isPublished (published = true, unpublished = false, all = no filter).
 *         schema: { type: string, enum: [all, published, unpublished], default: all }
 *       - in: query
 *         name: search
 *         required: false
 *         description: Case-insensitive whole-word match against title, name, address, area or city. Trimmed; empty means no search.
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         required: false
 *         schema: { type: string, enum: [RESIDENTIAL, COMMERCIAL, LAND] }
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 12 }
 *       - in: query
 *         name: sortBy
 *         required: false
 *         description: price sorts by priceAmount.
 *         schema: { type: string, enum: [createdAt, price], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         required: false
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Paginated properties.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminDashboardPropertyList'
 *       400:
 *         description: >
 *           A query parameter is invalid - status, type, sortBy or sortOrder not in its enum, page or limit
 *           not a positive integer, limit above 100, or a parameter given more than once (array).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: "type must be RESIDENTIAL, COMMERCIAL, or LAND." }
 *       401:
 *         description: No token, an invalid, expired or malformed token, or the token's user no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: No token provided }
 *       403:
 *         description: The authenticated user is not an ADMIN.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Insufficient permissions. Admin access required. }
 *       500:
 *         description: A database query failed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Internal server error. }
 */
router.get("/properties", checkJwt, checkIsAdmin, getAllPropertiesHandler);

/**
 * @swagger
 * /api/{version}/admin/properties/{id}/publish:
 *   patch:
 *     tags: [Properties]
 *     summary: Publish or unpublish a property
 *     description: Sets isPublished to the given value. Admin only.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isPublished]
 *             properties:
 *               isPublished: { type: boolean, example: true }
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Property ID.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The property's new publication state.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminDashboardPublishResult'
 *       400: { $ref: '#/components/responses/AdminDashboardBadRequest' }
 *       401:
 *         description: No token, an invalid, expired or malformed token, or the token's user no longer exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Invalid token }
 *       403:
 *         description: The authenticated user is not an ADMIN.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Insufficient permissions. Admin access required. }
 *       404:
 *         description: No property has this ID, or it was deleted.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Property not found. }
 *       500:
 *         description: A database query failed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Internal server error. }
 */
router.patch("/properties/:id/publish", checkJwt, checkIsAdmin, publishPropertyHandler);

/**
 * @swagger
 * /api/{version}/admin/dashboard/analytics:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: Verification analytics chart (requests paid per day)
 *     description: Successful payments per day (UTC). Weeks run Monday to Sunday. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - in: query
 *         name: range
 *         schema: { type: string, enum: [this_week, last_week, this_month], default: this_week }
 *     responses:
 *       200:
 *         description: One point per day; days without payments have count 0.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 range: { type: string, enum: [this_week, last_week, this_month] }
 *                 from: { type: string, format: date-time }
 *                 to: { type: string, format: date-time }
 *                 points:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label: { type: string, description: "Weekday (Mon) for weeks, day of month (1) for this_month", example: Mon }
 *                       date: { type: string, format: date, example: "2026-10-05" }
 *                       count: { type: integer, example: 3 }
 *       400: { $ref: '#/components/responses/AdminDashboardBadRequest' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.get("/dashboard/analytics", checkJwt, checkIsAdmin, getDashboardAnalyticsHandler);

/**
 * @swagger
 * /api/{version}/admin/notifications:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: The signed-in admin's notification inbox (the bell)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: unreadOnly, schema: { type: boolean, default: false } }
 *     responses:
 *       200:
 *         description: In-app notifications, newest first; unreadCount drives the red dot.
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
 *                       id: { type: string, format: uuid }
 *                       type: { type: string, example: VERIFICATION_REQUEST_CREATED }
 *                       title: { type: string, nullable: true, example: New verification request }
 *                       body: { type: string, nullable: true }
 *                       read: { type: boolean }
 *                       verificationRequestId: { type: string, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *                 unreadCount: { type: integer, example: 3 }
 *                 meta: { $ref: '#/components/schemas/AdminDashboardPaginationMeta' }
 *       400: { $ref: '#/components/responses/AdminDashboardBadRequest' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.get("/notifications", checkJwt, checkIsAdmin, getNotificationsHandler);

/**
 * @swagger
 * /api/{version}/admin/notifications/read-all:
 *   patch:
 *     tags: [Admin Dashboard]
 *     summary: Mark all of the admin's notifications as read
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *     responses:
 *       200:
 *         description: How many notifications were marked read.
 *         content: { application/json: { schema: { type: object, properties: { updated: { type: integer, example: 3 } } } } }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.patch("/notifications/read-all", checkJwt, checkIsAdmin, markAllNotificationsReadHandler);

/**
 * @swagger
 * /api/{version}/admin/notifications/{id}/read:
 *   patch:
 *     tags: [Admin Dashboard]
 *     summary: Mark one notification as read
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Marked read (also when it already was).
 *         content: { application/json: { schema: { type: object, properties: { id: { type: string }, read: { type: boolean, example: true } } } } }
 *       404: { $ref: '#/components/responses/AdminDashboardNotFound' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.patch("/notifications/:id/read", checkJwt, checkIsAdmin, markNotificationReadHandler);

/**
 * @swagger
 * /api/{version}/admin/agents:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: Verification agents to pick from when assigning a request
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - in: query
 *         name: tab
 *         description: all, active (available, under 5 open jobs) or busy (5 open jobs, fully booked)
 *         schema: { type: string, enum: [all, active, busy], default: all }
 *       - { in: query, name: search, description: Name, email or region, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Agents sorted by name. Send `id` as agentId to assign-agent.
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
 *                       id: { type: string, example: cmg3agent01 }
 *                       name: { type: string, example: John Anderson }
 *                       email: { type: string, format: email }
 *                       phone: { type: string, nullable: true }
 *                       region: { type: string, nullable: true, example: Lagos }
 *                       status: { type: string, enum: [ACTIVE, INACTIVE] }
 *                       displayStatus:
 *                         type: string
 *                         enum: [AVAILABLE, BUSY, SUSPENDED]
 *                         description: SUSPENDED when INACTIVE; BUSY at 5 open jobs; else AVAILABLE
 *                       avatarUrl: { type: string, nullable: true }
 *                       activeAssignments: { type: integer, description: "Open jobs (shown as N Properties)", example: 3 }
 *                       assignedPropertyCount: { type: integer, description: 'Properties assigned with "Assign Property" (5 at most)', example: 2 }
 *                 counts:
 *                   type: object
 *                   properties:
 *                     all: { type: integer, example: 10 }
 *                     active: { type: integer, example: 6 }
 *                     busy: { type: integer, example: 2 }
 *                     suspended: { type: integer, example: 2 }
 *       400: { $ref: '#/components/responses/AdminDashboardBadRequest' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.get("/agents", checkJwt, checkIsAdmin, getAgentsHandler);

/**
 * @swagger
 * /api/{version}/admin/verification-requests/{id}:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: One verification request (row "View details")
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The request with its client, agent, payments and reports (newest first).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 status: { type: string, description: Same display status as the list, example: IN_PROGRESS }
 *                 client:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     email: { type: string, format: email }
 *                     phone: { type: string, nullable: true }
 *                     avatarUrl: { type: string, nullable: true }
 *                 verificationType: { type: string, example: Land Verification }
 *                 plan:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     name: { type: string, example: Monthly }
 *                     frequency: { type: string, enum: [ONE_TIME, MONTHLY, QUARTERLY] }
 *                 details: { type: object, additionalProperties: true }
 *                 agent:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     assignmentStatus: { type: string, example: ACCEPTED }
 *                 payments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       status: { type: string, example: SUCCESS }
 *                       amountInCents: { type: integer, example: 500000 }
 *                       currency: { type: string, example: NGN }
 *                       paidAt: { type: string, format: date-time, nullable: true }
 *                 reports:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       generatedAt: { type: string, format: date-time, nullable: true }
 *                       reviewStatus: { type: string, enum: [PENDING, APPROVED, REVISION_REQUESTED] }
 *                       agentName: { type: string }
 *                 createdAt: { type: string, format: date-time }
 *       404: { $ref: '#/components/responses/AdminDashboardNotFound' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.get("/verification-requests/:id", checkJwt, checkIsAdmin, getVerificationRequestHandler);

/**
 * @swagger
 * /api/{version}/admin/agents/{id}/status:
 *   patch:
 *     tags: [Admin Dashboard]
 *     summary: Suspend or reactivate an agent
 *     description: >
 *       Suspending moves each open job to the active agent with the fewest open jobs who has room
 *       (under 5); when nobody has room, the job is unassigned and waits for an admin. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Verification agent ID, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [INACTIVE, ACTIVE], description: INACTIVE suspends, ACTIVE reactivates }
 *     responses:
 *       200:
 *         description: Status changed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 status: { type: string, enum: [ACTIVE, INACTIVE] }
 *                 reassigned: { type: integer, description: Open jobs moved to other agents, example: 3 }
 *                 unassigned: { type: integer, description: Open jobs left waiting for an agent, example: 0 }
 *       400: { $ref: '#/components/responses/AdminDashboardBadRequest' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       404: { $ref: '#/components/responses/AdminDashboardNotFound' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.patch("/agents/:id/status", checkJwt, checkIsAdmin, updateAgentStatusHandler);

/**
 * @swagger
 * /api/{version}/admin/properties:
 *   post:
 *     tags: [Admin Dashboard]
 *     summary: Add a property ("Save as Draft" or "Save & Publish")
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, propertyType, priceAmount, location]
 *             properties:
 *               title: { type: string, example: 4 Bedroom Duplex }
 *               propertyType: { type: string, enum: [RESIDENTIAL, COMMERCIAL, LAND] }
 *               priceAmount: { type: integer, description: Price in whole naira (commas allowed), example: 85000000 }
 *               location: { type: string, description: "Area, then city after the last comma", example: "Lekki Phase 1, Lagos" }
 *               description: { type: string }
 *               bedrooms: { type: integer, example: 4 }
 *               bathrooms: { type: integer, example: 3 }
 *               sizeSqm: { type: number, description: Floor area in square metres, example: 350 }
 *               yearBuilt: { type: integer, example: 2024 }
 *               amenities:
 *                 type: array
 *                 description: Repeat the field once per amenity
 *                 items: { $ref: '#/components/schemas/AdminDashboardAmenity' }
 *               isPublished: { type: boolean, description: true for "Save & Publish", false for "Save as Draft", default: false }
 *               coverImage: { type: string, format: binary, description: "One PNG or JPEG, max 5 MB" }
 *               images:
 *                 type: array
 *                 description: Other images, up to 4 PNG or JPEG, max 5 MB each
 *                 items: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: The created property.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminDashboardProperty' }
 *       400: { $ref: '#/components/responses/AdminDashboardBadRequest' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.post("/properties", checkJwt, checkIsAdmin, propertyImagesUpload, createPropertyHandler);

/**
 * @swagger
 * /api/{version}/admin/properties/{id}:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: Property details
 *     description: One property (not deleted) with its views, inquiries and favorites. Admin only.
 *     security:
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
 *                     updatedAt: { type: string, format: date-time }
 *                     stats:
 *                       type: object
 *                       properties:
 *                         views: { type: integer, example: 1234 }
 *                         inquiries: { type: integer, example: 12 }
 *                         favorites: { type: integer, example: 45 }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       404: { $ref: '#/components/responses/AdminDashboardNotFound' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 *   patch:
 *     tags: [Admin Dashboard]
 *     summary: Edit a property
 *     description: >
 *       Same fields as Add Property, all optional; only the fields sent are changed and a field
 *       sent blank is cleared. New `images` are added to the existing ones (4 at most in total).
 *       A new `coverImage` replaces the cover. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               propertyType: { type: string, enum: [RESIDENTIAL, COMMERCIAL, LAND] }
 *               priceAmount: { type: integer, description: Price in whole naira (commas allowed) }
 *               location: { type: string, example: "Lekki Phase 1, Lagos" }
 *               description: { type: string }
 *               bedrooms: { type: integer }
 *               bathrooms: { type: integer }
 *               sizeSqm: { type: number }
 *               yearBuilt: { type: integer }
 *               amenities:
 *                 type: array
 *                 description: Replaces the list. Repeat once per amenity; send one blank value to clear it.
 *                 items: { $ref: '#/components/schemas/AdminDashboardAmenity' }
 *               isPublished: { type: boolean }
 *               removeImageUrls:
 *                 type: array
 *                 description: URLs of current photos (cover or others) to remove. Repeat once per URL.
 *                 items: { type: string }
 *               coverImage: { type: string, format: binary }
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: The updated property.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminDashboardProperty' }
 *       400: { $ref: '#/components/responses/AdminDashboardBadRequest' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       404: { $ref: '#/components/responses/AdminDashboardNotFound' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 *   delete:
 *     tags: [Admin Dashboard]
 *     summary: Delete a property
 *     description: Hides the property everywhere (admin and client). The record is kept. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The property was deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 deleted: { type: boolean, example: true }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       404: { $ref: '#/components/responses/AdminDashboardNotFound' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.get("/properties/:id", checkJwt, checkIsAdmin, getPropertyHandler);
router.patch(
  "/properties/:id",
  checkJwt,
  checkIsAdmin,
  propertyImagesUpload,
  updatePropertyHandler,
);
router.delete("/properties/:id", checkJwt, checkIsAdmin, deletePropertyHandler);

/**
 * @swagger
 * /api/{version}/admin/users:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: User Management list (clients and agents)
 *     description: Newest first. Admins are not listed. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: query, name: type, schema: { type: string, enum: [all, client, agent], default: all } }
 *       - { in: query, name: search, description: Name, email or phone (case-insensitive), schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *     responses:
 *       200:
 *         description: One page of users, with per-tab totals (they honour search).
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
 *                       id: { type: string }
 *                       agentId: { type: string, nullable: true, description: "For agents: open their profile at /admin/agents/{agentId}" }
 *                       name: { type: string, example: John Williams }
 *                       email: { type: string, example: john@example.com }
 *                       phone: { type: string, nullable: true, example: "+234 801 234 5678" }
 *                       avatarUrl: { type: string, nullable: true }
 *                       type: { type: string, enum: [CLIENT, AGENT] }
 *                       status: { type: string, enum: [ACTIVE, SUSPENDED] }
 *                       joinedAt: { type: string, format: date-time }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     totalItems: { type: integer }
 *                     totalPages: { type: integer }
 *                 counts:
 *                   type: object
 *                   properties:
 *                     all: { type: integer }
 *                     client: { type: integer }
 *                     agent: { type: integer }
 *       400: { $ref: '#/components/responses/AdminDashboardBadRequest' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.get("/users", checkJwt, checkIsAdmin, getUsersHandler);

/**
 * @swagger
 * /api/{version}/admin/users/{id}:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: A client's profile ("View Profile")
 *     description: >
 *       Clients only; agents' profiles are at /admin/agents/{agentId}. For "Request History", call
 *       GET /admin/verification-requests?userId={id}. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: User ID, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The client's profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 name: { type: string, example: Kingsley Wilson }
 *                 email: { type: string }
 *                 phone: { type: string, nullable: true }
 *                 location: { type: string, nullable: true }
 *                 avatarUrl: { type: string, nullable: true }
 *                 status: { type: string, enum: [ACTIVE, SUSPENDED] }
 *                 memberSince: { type: string, format: date-time }
 *                 stats:
 *                   type: object
 *                   properties:
 *                     paidRequests: { type: integer, description: Verification requests with at least one successful payment, example: 8 }
 *                     totalSpent: { type: number, description: Sum of successful payments in naira, example: 125000 }
 *                     averageResponseDays: { type: number, nullable: true, description: "Average days from an agent being assigned to the report being ready (1 decimal); null before any report", example: 3 }
 *                 recentActivity:
 *                   type: array
 *                   description: The 10 newest activity entries on the client's requests.
 *                   items: { $ref: '#/components/schemas/AdminDashboardActivity' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       404: { $ref: '#/components/responses/AdminDashboardNotFound' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.get("/users/:id", checkJwt, checkIsAdmin, getUserHandler);

/**
 * @swagger
 * /api/{version}/admin/users/{id}/status:
 *   patch:
 *     tags: [Admin Dashboard]
 *     summary: Suspend or reactivate a client or agent
 *     description: >
 *       Suspended users can't log in, and their existing tokens stop working (403). Suspending an
 *       agent also moves their open jobs, exactly like PATCH /admin/agents/{id}/status. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: User ID, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [ACTIVE, SUSPENDED] }
 *     responses:
 *       200:
 *         description: The new status. reassigned and unassigned count the agent's moved jobs (0 for clients).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 status: { type: string, enum: [ACTIVE, SUSPENDED] }
 *                 reassigned: { type: integer }
 *                 unassigned: { type: integer }
 *       400: { $ref: '#/components/responses/AdminDashboardBadRequest' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       404: { $ref: '#/components/responses/AdminDashboardNotFound' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.patch("/users/:id/status", checkJwt, checkIsAdmin, updateUserStatusHandler);

/**
 * @swagger
 * /api/{version}/admin/agents/{id}:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: An agent's profile
 *     description: >
 *       The Agent Profile page. displayStatus and stats come from verification requests;
 *       assignedProperties and the badge counts are the property listings assigned with "Assign Property". Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Verification agent ID, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The agent's profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 userId: { type: string }
 *                 name: { type: string, example: Kingsley Wilson }
 *                 email: { type: string }
 *                 phone: { type: string, nullable: true }
 *                 region: { type: string, nullable: true }
 *                 avatarUrl: { type: string, nullable: true }
 *                 displayStatus: { type: string, enum: [AVAILABLE, BUSY, SUSPENDED] }
 *                 assignedPropertyCount: { type: integer, description: 'Properties assigned ("4/5 Properties Assigned")', example: 4 }
 *                 maxAssignedProperties: { type: integer, example: 5 }
 *                 memberSince: { type: string, format: date-time }
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalVerifications: { type: integer, description: Reports completed, example: 56 }
 *                     successRate: { type: integer, nullable: true, description: "% of reviewed reports approved without a revision request; null before any review", example: 89 }
 *                     averageResponseDays: { type: number, nullable: true, description: Average days from assignment to report ready (1 decimal), example: 3 }
 *                 assignedProperties:
 *                   type: array
 *                   description: Properties assigned to the agent with POST /admin/properties/{id}/assign-agent, most recently changed first.
 *                   items: { $ref: '#/components/schemas/AdminDashboardProperty' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       404: { $ref: '#/components/responses/AdminDashboardNotFound' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.get("/agents/:id", checkJwt, checkIsAdmin, getAgentHandler);

/**
 * @swagger
 * /api/{version}/admin/properties/{id}/assign-agent:
 *   post:
 *     tags: [Admin Dashboard]
 *     summary: Assign an agent to a property ("Assign Property")
 *     description: >
 *       Sets the property's agent, replacing any agent already on it. An agent can have at most
 *       5 properties (409 when full); this is separate from their 5 verification jobs. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Property ID, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentId]
 *             properties:
 *               agentId: { type: string, description: Verification agent ID }
 *     responses:
 *       200:
 *         description: The property's agent.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminDashboardPropertyAgent' }
 *       400: { $ref: '#/components/responses/AdminDashboardBadRequest' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       404: { $ref: '#/components/responses/AdminDashboardNotFound' }
 *       409:
 *         description: The agent already has 5 properties.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Agent is fully booked. Agents can only handle 5 properties at a time. }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 *   delete:
 *     tags: [Admin Dashboard]
 *     summary: Remove a property's agent
 *     description: Repeating it changes nothing. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Property ID, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The property, now with no agent.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminDashboardPropertyAgent' }
 *       401: { $ref: '#/components/responses/AdminDashboardUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminDashboardForbidden' }
 *       404: { $ref: '#/components/responses/AdminDashboardNotFound' }
 *       500: { $ref: '#/components/responses/AdminDashboardServerError' }
 */
router.post("/properties/:id/assign-agent", checkJwt, checkIsAdmin, assignPropertyAgentHandler);
router.delete("/properties/:id/assign-agent", checkJwt, checkIsAdmin, unassignPropertyAgentHandler);

export default router;
