import { Router } from "express";
import { checkJwt } from "../../../middlewares/check-jwt";
import { checkIsAdmin } from "../../../middlewares/check-roles";
import { getAllPropertiesHandler } from "./handlers/get-all-properties";
import { getDashboardStatsHandler } from "./handlers/get-dashboard-stats";
import { getVerificationRequestsHandler } from "./handlers/get-verification-requests";
import { publishPropertyHandler } from "./handlers/publish-property";
import { getAllActivitiesHandler } from "./handlers/get-all-activities";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminDashboardStats:
 *       type: object
 *       required: [totalUsers, numberOfPendingRequest, numberOfActiveAgents, numberOfProperties]
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
 *     AdminDashboardActivity:
 *       type: object
 *       description: A notification with notificationStatus SENT. Optional keys are omitted from the JSON when they have no value.
 *       required: [id, type, title, body, createdAt, sentAt, meta]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: 3f1c2a7e-8b4d-4f0a-9a51-2d6c0e7b9f10
 *         type:
 *           type: string
 *           enum: [USER_REGISTERED, USER_LOGIN, PAYMENT_RECEIVED, FORGOT_PASSWORD, VERIFICATION_REQUEST_CREATED, REPORT_UPLOADED, AGENT_ASSIGNED, INSPECTION_STARTED]
 *           example: VERIFICATION_REQUEST_CREATED
 *         channel:
 *           type: string
 *           description: Value of meta.channel when it is a string; omitted otherwise.
 *           example: email
 *         title:
 *           type: string
 *           nullable: true
 *           example: New verification request
 *         body:
 *           type: string
 *           nullable: true
 *           example: Jane Doe submitted a new verification request.
 *         clientName:
 *           type: string
 *           description: Only for VERIFICATION_REQUEST_CREATED; meta.clientName, falling back to meta.userFullName. Omitted when absent.
 *           example: Jane Doe
 *         agentName:
 *           type: string
 *           description: Only for REPORT_UPLOADED and AGENT_ASSIGNED; meta.agentName. Omitted when absent.
 *           example: John Agent
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-10-01T09:30:00.000Z"
 *         sentAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2026-10-01T09:30:02.000Z"
 *         meta:
 *           type: object
 *           nullable: true
 *           additionalProperties: true
 *           description: The raw notification meta JSON, returned as stored.
 *           example: { channel: email, clientName: Jane Doe }
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
 *           description: Per-tab totals. They honour search, agentId and propertyType but ignore the status filter.
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
 *       required: [id, title, type, location, price, viewCount, coverImageUrl, isPublished, createdAt]
 *       properties:
 *         id:
 *           type: string
 *           example: cm1property0001
 *         title:
 *           type: string
 *           description: The property's title, or its name when the title is empty.
 *           example: 3 Bedroom Flat in Lekki
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
 *               description: The stored priceAmount.
 *               example: 85000000
 *             currency:
 *               type: string
 *               example: NGN
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
 *     summary: Get sent notification activities
 *     description: >
 *       Returns every notification (for all users) whose notificationStatus is SENT, newest first.
 *       The list is not paginated and takes no query parameters. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     responses:
 *       200:
 *         description: Sent notification activities, ordered by createdAt descending.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [activities]
 *               properties:
 *                 activities:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AdminDashboardActivity'
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
 *       500:
 *         description: The database query failed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { status: error, message: Internal server error. }
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
 *     summary: Toggle a property's publication state
 *     description: Flips isPublished (published becomes unpublished and vice versa). Takes no request body. Admin only.
 *     x-no-body: true
 *     security:
 *       - bearerAuth: []
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
 *         description: No property has this ID.
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

export default router;
