import { Router } from "express";
import multer from "multer";
import { checkJwt } from "../../../middlewares/check-jwt";
import { idempotent } from "../../../middlewares/idempotency";
import { getVerificationReportSummary } from "./handlers/get-verification-report-summary";
import { getVerificationRequests } from "./handlers/get-verification-requests";
import { getVerificationTypes } from "./handlers/get-verification-types";
import { postVerificationRequest } from "./handlers/post-verification-request";
import { postVerificationDocuments } from "./handlers/post-verification-documents";
import { patchVerificationRequest } from "./handlers/patch-verification-request";
import { patchVerificationRequestPlan } from "./handlers/patch-verification-request-plan";
import { getVerificationTypesPlan } from "./handlers/get-verification-types-plan";
import { getVerificationRequest } from "./handlers/get-verification-request";
import { getVerificationRequestTracking } from "./handlers/get-verification-request-tracking";
import { patchVerificationRequestNotificationPreferences } from "./handlers/patch-verification-request-notification-preferences";
import { getVerificationRequestReportSummary } from "./handlers/get-verification-request-report-summary";
import { getVerificationRequestFullReport } from "./handlers/get-verification-request-full-report";
import { postVerificationRequestReportComment } from "./handlers/post-verification-request-report-comment";
import { getVerificationRequestReports } from "./handlers/get-verification-request-reports";
import { initializeVerificationPaymentPaystack } from "./handlers/initialize-verification-payment-paystack";
import { initializeVerificationPaymentStripe } from "./handlers/initialize-verification-payment-stripe";
import { getVerificationPricingCatalog } from "./handlers/get-verification-pricing-catalog";
import { patchVerificationRequestPricing } from "./handlers/patch-verification-request-pricing";
import { postVerificationRequestQuote } from "./handlers/post-verification-request-quote";
import { getVerificationRequestQuote } from "./handlers/get-verification-request-quote";
import { acceptVerificationRequestQuote } from "./handlers/accept-verification-request-quote";
import { getVerificationRequestCheckoutSummary } from "./handlers/get-verification-request-checkout-summary";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @swagger
 * components:
 *   schemas:
 *     ClientVerificationStatus:
 *       type: string
 *       enum: [DRAFT, PENDING_PAYMENT, PAYMENT_FAILED, SUBMITTED, IN_PROGRESS, AWAITING_RENEWAL, COMPLETED, CANCELLED]
 *       example: DRAFT
 *     ClientVerificationFrequency:
 *       type: string
 *       enum: [ONE_TIME, MONTHLY, QUARTERLY]
 *       example: ONE_TIME
 *     ClientVerificationReportReviewStatus:
 *       type: string
 *       enum: [PENDING, APPROVED, REVISION_REQUESTED]
 *       example: APPROVED
 *     ClientVerificationPropertyDetails:
 *       type: object
 *       description: >
 *         Details for any verification type whose slug is not `construction-progress` or
 *         `business-verification` (e.g. property verification). Values are trimmed; any other
 *         keys are dropped.
 *       required: [propertyType, propertyAddress]
 *       properties:
 *         propertyName:
 *           type: string
 *           minLength: 1
 *           description: Optional; if sent it must be a non-empty string.
 *           example: Lekki Gardens Block C
 *         propertyType:
 *           type: string
 *           minLength: 1
 *           description: Free-form string (not validated against an enum).
 *           example: COMPLETED_BUILDING
 *         propertyAddress:
 *           type: string
 *           minLength: 1
 *           example: 12 Admiralty Way, Lekki Phase 1, Lagos
 *     ClientVerificationConstructionDetails:
 *       type: object
 *       description: Details for the `construction-progress` verification type. Values are trimmed; any other keys are dropped.
 *       required: [constructionAddress, projectType, currentConstructionStage]
 *       properties:
 *         constructionAddress:
 *           type: string
 *           minLength: 1
 *           example: Plot 4, Ajah, Lagos
 *         projectType:
 *           type: string
 *           minLength: 1
 *           example: Duplex
 *         currentConstructionStage:
 *           type: string
 *           minLength: 1
 *           example: Roofing
 *     ClientVerificationBusinessDetails:
 *       type: object
 *       description: Details for the `business-verification` verification type. Values are trimmed; any other keys are dropped.
 *       required: [businessName, businessType, businessAddress]
 *       properties:
 *         businessName:
 *           type: string
 *           minLength: 1
 *           example: Acme Ventures Ltd
 *         businessType:
 *           type: string
 *           minLength: 1
 *           example: Limited liability company
 *         businessAddress:
 *           type: string
 *           minLength: 1
 *           example: 5 Broad Street, Lagos Island
 *     ClientVerificationDetails:
 *       description: >
 *         The stored details object. Which fields it contains depends on the verification type slug:
 *         `construction-progress` uses constructionAddress, projectType, currentConstructionStage;
 *         `business-verification` uses businessName, businessType, businessAddress;
 *         every other slug uses propertyType, propertyAddress and optional propertyName.
 *       oneOf:
 *         - $ref: '#/components/schemas/ClientVerificationPropertyDetails'
 *         - $ref: '#/components/schemas/ClientVerificationConstructionDetails'
 *         - $ref: '#/components/schemas/ClientVerificationBusinessDetails'
 *     ClientVerificationTypeCard:
 *       type: object
 *       required: [id, name, slug, description, icon]
 *       properties:
 *         id: { type: string, example: cm1vtype0001 }
 *         name: { type: string, example: Property Verification }
 *         slug: { type: string, example: property-verification }
 *         description:
 *           type: string
 *           description: Empty string when the type has no description.
 *           example: Confirm a property exists and matches its listing.
 *         icon: { type: string, nullable: true, example: home }
 *     ClientVerificationPlanCard:
 *       type: object
 *       required: [id, frequency, name, description, priceUsdCents, priceNgnKobo, paymentProviders]
 *       properties:
 *         id: { type: string, example: cm1vplan0001 }
 *         frequency: { $ref: '#/components/schemas/ClientVerificationFrequency' }
 *         name: { type: string, example: One-time verification }
 *         description:
 *           type: string
 *           description: Empty string when the plan has no description.
 *           example: A single inspection and report.
 *         priceUsdCents:
 *           type: integer
 *           description: Independently configured USD price in cents; the NGN price is configured separately.
 *           example: 4500
 *         priceNgnKobo:
 *           type: integer
 *           description: NGN price in kobo.
 *           example: 7200000
 *         paymentProviders:
 *           type: object
 *           required: [USD, NGN]
 *           properties:
 *             USD: { type: string, enum: [STRIPE], example: STRIPE }
 *             NGN: { type: string, enum: [PAYSTACK], example: PAYSTACK }
 *     ClientVerificationPlanPricing:
 *       type: object
 *       required: [frequency, name, priceUsdCents, priceNgnKobo, paymentProviders]
 *       properties:
 *         frequency: { $ref: '#/components/schemas/ClientVerificationFrequency' }
 *         name: { type: string, example: One-time verification }
 *         priceUsdCents: { type: integer, description: Independently configured USD price in cents., example: 4500 }
 *         priceNgnKobo: { type: integer, description: Independently configured NGN price in kobo., example: 7200000 }
 *         paymentProviders:
 *           type: object
 *           required: [USD, NGN]
 *           properties:
 *             USD: { type: string, enum: [STRIPE], example: STRIPE }
 *             NGN: { type: string, enum: [PAYSTACK], example: PAYSTACK }
 *     ClientVerificationRequestCreated:
 *       type: object
 *       required: [id, status, verificationTypeId, details, additionalNote, createdAt]
 *       properties:
 *         id: { type: string, example: cm1vreq0001 }
 *         status:
 *           allOf:
 *             - $ref: '#/components/schemas/ClientVerificationStatus'
 *           description: Always DRAFT for a new request.
 *         verificationTypeId: { type: string, example: cm1vtype0001 }
 *         details: { $ref: '#/components/schemas/ClientVerificationDetails' }
 *         additionalNote: { type: string, nullable: true, example: Gate code is 1234 }
 *         createdAt: { type: string, format: date-time, example: "2026-10-07T09:30:00.000Z" }
 *     ClientVerificationRequestRecord:
 *       type: object
 *       description: The full verification request row as stored.
 *       required: [id, userId, verificationTypeId, verificationPlanId, status, details, additionalNote, notifyOnInspectionStart, notifyOnReportReady, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, example: cm1vreq0001 }
 *         userId: { type: string, example: cm1user0001 }
 *         verificationTypeId: { type: string, example: cm1vtype0001 }
 *         verificationPlanId: { type: string, nullable: true, example: cm1vplan0001 }
 *         status: { $ref: '#/components/schemas/ClientVerificationStatus' }
 *         details: { $ref: '#/components/schemas/ClientVerificationDetails' }
 *         additionalNote: { type: string, nullable: true, example: Gate code is 1234 }
 *         notifyOnInspectionStart: { type: boolean, example: true }
 *         notifyOnReportReady: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time, example: "2026-10-07T09:30:00.000Z" }
 *         updatedAt: { type: string, format: date-time, example: "2026-10-07T09:45:00.000Z" }
 *     ClientVerificationRequestListItem:
 *       type: object
 *       required: [id, title, verificationType, status, updatedAt]
 *       properties:
 *         id: { type: string, example: cm1vreq0001 }
 *         title:
 *           type: string
 *           description: details.propertyName when it is a non-empty string, otherwise "Verification request".
 *           example: Lekki Gardens Block C
 *         verificationType:
 *           type: object
 *           required: [name, icon]
 *           properties:
 *             name: { type: string, example: Property Verification }
 *             icon: { type: string, nullable: true, example: home }
 *         status: { $ref: '#/components/schemas/ClientVerificationStatus' }
 *         updatedAt: { type: string, format: date-time, example: "2026-10-07T09:45:00.000Z" }
 *     ClientVerificationRequestDetail:
 *       type: object
 *       required: [id, status, verificationType, details, plan, createdAt]
 *       properties:
 *         id: { type: string, example: cm1vreq0001 }
 *         status: { $ref: '#/components/schemas/ClientVerificationStatus' }
 *         verificationType:
 *           type: object
 *           required: [name]
 *           properties:
 *             name: { type: string, example: Property Verification }
 *         details: { $ref: '#/components/schemas/ClientVerificationDetails' }
 *         plan:
 *           allOf:
 *             - $ref: '#/components/schemas/ClientVerificationPlanPricing'
 *           nullable: true
 *         pricing:
 *           type: object
 *           description: Present when pricing was selected from the verification-tier catalogue.
 *           required: [verificationTier, monitoringPlan, recurringConsent]
 *           properties:
 *             verificationTier:
 *               type: object
 *               required: [id, code, name, description, priceUsdCents, quoteRequired]
 *               properties:
 *                 id: { type: string, example: cm1vtier0001 }
 *                 code: { type: string, enum: [BASIC, STANDARD, PREMIUM], example: STANDARD }
 *                 name: { type: string, example: Standard }
 *                 description: { type: string, example: Property title and court checks }
 *                 priceUsdCents: { type: integer, nullable: true, example: 6000 }
 *                 quoteRequired: { type: boolean, example: false }
 *             monitoringPlan:
 *               type: object
 *               nullable: true
 *               required: [id, code, name, priceUsdCents, intervalCount, checksPerPeriod, reportsPerPeriod]
 *               properties:
 *                 id: { type: string, example: cm1mplan0001 }
 *                 code: { type: string, enum: [WEEKLY, MONTHLY, QUARTERLY], example: MONTHLY }
 *                 name: { type: string, example: Monthly monitoring }
 *                 priceUsdCents: { type: integer, example: 6000 }
 *                 intervalCount: { type: integer, example: 1 }
 *                 checksPerPeriod: { type: integer, example: 2 }
 *                 reportsPerPeriod: { type: integer, example: 1 }
 *             recurringConsent: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time, example: "2026-10-07T09:30:00.000Z" }
 *     ClientVerificationPlanSelection:
 *       type: object
 *       required: [id, status, verificationPlanId, plan]
 *       properties:
 *         id: { type: string, example: cm1vreq0001 }
 *         status: { $ref: '#/components/schemas/ClientVerificationStatus' }
 *         verificationPlanId: { type: string, example: cm1vplan0001 }
 *         plan: { $ref: '#/components/schemas/ClientVerificationPlanPricing' }
 *     ClientVerificationPaystackCheckout:
 *       type: object
 *       required: [authorization_url, access_code, reference]
 *       properties:
 *         authorization_url: { type: string, format: uri, example: "https://checkout.paystack.com/0peioxfhpn" }
 *         access_code: { type: string, example: 0peioxfhpn }
 *         reference: { type: string, example: 7PVGX8MEk85tgeEpVDtD }
 *     ClientVerificationStripeCheckout:
 *       type: object
 *       required: [url]
 *       properties:
 *         url: { type: string, format: uri, example: "https://checkout.stripe.com/c/pay/cs_test_a1b2c3" }
 *     ClientVerificationDocument:
 *       type: object
 *       required: [id, url, fileName, fileType, fileSizeBytes]
 *       properties:
 *         id: { type: string, example: cm1doc0001 }
 *         url: { type: string, format: uri, example: "https://res.cloudinary.com/demo/image/upload/v1/bonafide-services/verification-documents/deed.jpg" }
 *         fileName: { type: string, example: deed.jpg }
 *         fileType: { type: string, example: image/jpeg }
 *         fileSizeBytes: { type: integer, example: 482113 }
 *     ClientVerificationReportsSummary:
 *       type: object
 *       required: [unviewedReportsCount]
 *       properties:
 *         unviewedReportsCount: { type: integer, minimum: 0, example: 2 }
 *     ClientVerificationFinding:
 *       type: object
 *       description: >
 *         One entry of the report's raw `findings` JSON array, returned exactly as stored. The
 *         server does not validate its shape; entries are expected to look like
 *         `{ label, value, status }`.
 *       additionalProperties: true
 *       properties:
 *         label: { type: string, example: Ownership }
 *         value: { type: string, example: Title matches the registered owner }
 *         status: { type: string, enum: [good, warning, bad], example: good }
 *     ClientVerificationTieredFindings:
 *       type: object
 *       description: Tier-specific sections keyed by public report section.
 *       additionalProperties:
 *         type: object
 *         additionalProperties: true
 *       example:
 *         physicalVisit: { outcome: VERIFIED, notes: The property was located and inspected. }
 *     ClientVerificationReportTier:
 *       type: object
 *       nullable: true
 *       required: [code, name]
 *       properties:
 *         code: { type: string, nullable: true, example: PREMIUM }
 *         name: { type: string, nullable: true, example: Premium }
 *     ClientVerificationSubscriptionPeriod:
 *       type: object
 *       nullable: true
 *       required: [startsAt, endsAt, checksIncluded, checksCompleted]
 *       properties:
 *         startsAt: { type: string, format: date-time, nullable: true, example: "2026-11-04T12:20:00.000Z" }
 *         endsAt: { type: string, format: date-time, nullable: true, example: "2026-12-04T12:20:00.000Z" }
 *         checksIncluded: { type: integer, nullable: true, example: 2 }
 *         checksCompleted: { type: integer, nullable: true, example: 2 }
 *     ClientVerificationNotificationPreferences:
 *       type: object
 *       required: [notifyOnInspectionStart, notifyOnReportReady]
 *       properties:
 *         notifyOnInspectionStart: { type: boolean, example: true }
 *         notifyOnReportReady: { type: boolean, example: false }
 *     ClientVerificationTracking:
 *       type: object
 *       required: [id, verificationType, address, progressPercent, timeline, agent, inspectionUploads, monitoring, notificationPreferences]
 *       properties:
 *         id: { type: string, example: cm1vreq0001 }
 *         verificationType:
 *           type: object
 *           required: [name]
 *           properties:
 *             name: { type: string, example: Property Verification }
 *         address:
 *           type: string
 *           description: details.propertyAddress, or "Address not provided" (construction and business requests always get the fallback).
 *           example: 12 Admiralty Way, Lekki Phase 1, Lagos
 *         progressPercent:
 *           type: integer
 *           minimum: 0
 *           maximum: 100
 *           description: Share of COMPLETE checklist items on the current assignment (rounded); falls back to the assignment's stored progressPercent when it has no checklist, and 0 when there is no assignment.
 *           example: 60
 *         monitoring:
 *           type: object
 *           nullable: true
 *           description: Latest monitoring subscription and paid period, or null when the request has no monitoring subscription.
 *           required: [status, plan, currentPeriod, cancelAtPeriodEnd]
 *           properties:
 *             status: { type: string, enum: [ACTIVE, NON_RENEWING, PAYMENT_FAILED, DISABLED, EXPIRED] }
 *             plan: { type: string, nullable: true, example: MONTHLY }
 *             cancelAtPeriodEnd: { type: boolean, example: false }
 *             currentPeriod:
 *               type: object
 *               nullable: true
 *               required: [startsAt, endsAt, checksIncluded, checksCompleted, reportStatus, siteVisits]
 *               properties:
 *                 startsAt: { type: string, format: date-time }
 *                 endsAt: { type: string, format: date-time }
 *                 checksIncluded: { type: integer, minimum: 0 }
 *                 checksCompleted: { type: integer, minimum: 0 }
 *                 reportStatus: { type: string, enum: [PENDING, IN_PROGRESS, COMPLETED] }
 *                 siteVisits:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [id, visitNumber, status, completedAt]
 *                     properties:
 *                       id: { type: string }
 *                       visitNumber: { type: integer }
 *                       status: { type: string, enum: [PENDING, SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED] }
 *                       completedAt: { type: string, format: date-time, nullable: true }
 *         timeline:
 *           type: object
 *           required: [requestSubmittedAt, agentAssignedAt, inspectionStartedAt, inspectionCompletedAt, reportReadyAt]
 *           properties:
 *             requestSubmittedAt:
 *               type: string
 *               format: date-time
 *               description: When the request was created (not when it was paid for).
 *               example: "2026-10-01T08:00:00.000Z"
 *             agentAssignedAt: { type: string, format: date-time, nullable: true, example: "2026-10-02T10:00:00.000Z" }
 *             inspectionStartedAt:
 *               type: string
 *               format: date-time
 *               nullable: true
 *               description: The assignment's scheduledAt.
 *               example: "2026-10-03T09:00:00.000Z"
 *             inspectionCompletedAt: { type: string, format: date-time, nullable: true, example: null }
 *             reportReadyAt:
 *               type: string
 *               format: date-time
 *               nullable: true
 *               description: generatedAt of the latest report, only if it belongs to the current assignment's paid period.
 *               example: null
 *         agent:
 *           type: object
 *           nullable: true
 *           description: Null until an agent is assigned.
 *           required: [firstName, lastName, isVerified, photoUrl]
 *           properties:
 *             firstName: { type: string, example: Ada }
 *             lastName: { type: string, example: Okafor }
 *             isVerified: { type: boolean, description: Always true., example: true }
 *             photoUrl: { type: string, nullable: true, example: "https://res.cloudinary.com/demo/image/upload/agent.jpg" }
 *         inspectionUploads:
 *           type: array
 *           description: Every media file on the current assignment's checklist items.
 *           items:
 *             type: object
 *             required: [url, label]
 *             properties:
 *               url: { type: string, example: "https://res.cloudinary.com/demo/image/upload/front.jpg" }
 *               label: { type: string, description: The uploaded file name., example: front.jpg }
 *         notificationPreferences: { $ref: '#/components/schemas/ClientVerificationNotificationPreferences' }
 *     ClientVerificationReportSummary:
 *       type: object
 *       required: [property, inspectionDate, location, reportType, insights, findings, verificationTier, subscriptionPeriod, providerName, checklist, reportDocument, mediaPreview]
 *       properties:
 *         property:
 *           type: string
 *           description: details.propertyName, or "Property".
 *           example: Lekki Gardens Block C
 *         inspectionDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: generatedAt of the latest report; null when there is no report yet.
 *           example: "2026-10-05T12:00:00.000Z"
 *         location:
 *           type: string
 *           description: details.propertyAddress, or "Address not provided".
 *           example: 12 Admiralty Way, Lekki Phase 1, Lagos
 *         reportType:
 *           type: string
 *           description: The selected tier's name, legacy plan name, or "Standard Report".
 *           example: One-time verification
 *         insights:
 *           type: array
 *           description: Legacy findings array, empty for tiered reports.
 *           items: { $ref: '#/components/schemas/ClientVerificationFinding' }
 *         findings:
 *           description: Legacy findings array or tier-specific section results.
 *           oneOf:
 *             - type: array
 *               items: { $ref: '#/components/schemas/ClientVerificationFinding' }
 *             - $ref: '#/components/schemas/ClientVerificationTieredFindings'
 *         verificationTier: { $ref: '#/components/schemas/ClientVerificationReportTier' }
 *         subscriptionPeriod: { $ref: '#/components/schemas/ClientVerificationSubscriptionPeriod' }
 *         providerName: { type: string, enum: [Bonafide], example: Bonafide }
 *         checklist:
 *           type: array
 *           items: { $ref: '#/components/schemas/ClientVerificationReportChecklistItem' }
 *         reportDocument:
 *           allOf:
 *             - $ref: '#/components/schemas/ClientVerificationReportDocument'
 *           nullable: true
 *         mediaPreview:
 *           type: array
 *           maxItems: 3
 *           description: Up to 3 media URLs from the latest report's checklist (or the assignment's checklist when the report has none).
 *           items:
 *             type: object
 *             required: [url]
 *             properties:
 *               url: { type: string, example: "https://res.cloudinary.com/demo/image/upload/front.jpg" }
 *     ClientVerificationReportChecklistItem:
 *       type: object
 *       required: [label, status]
 *       properties:
 *         label: { type: string, example: Physical/site visit }
 *         status:
 *           type: string
 *           nullable: true
 *           enum: [PENDING, COMPLETE]
 *           description: Null when older reports do not contain this checklist section.
 *         sectionKey: { type: string, nullable: true, example: site_visit }
 *         result:
 *           type: object
 *           nullable: true
 *           additionalProperties: true
 *         media:
 *           type: array
 *           items:
 *             type: object
 *             required: [url, fileName]
 *             properties:
 *               url: { type: string, format: uri }
 *               fileName: { type: string, nullable: true }
 *     ClientVerificationReportDocument:
 *       type: object
 *       required: [id, url, fileName, fileType, fileSizeBytes, contentType]
 *       properties:
 *         id: { type: string, example: cm9document0001 }
 *         url: { type: string, format: uri, example: "https://res.cloudinary.com/demo/raw/upload/report.pdf" }
 *         fileName: { type: string, example: verification-report.pdf }
 *         fileType: { type: string, example: application/pdf }
 *         fileSizeBytes: { type: integer, example: 245760 }
 *         contentType: { type: string, example: application/pdf }
 *     ClientVerificationFullReport:
 *       type: object
 *       required: [id, reportId, generatedAt, reviewStatus, client, property, summary, ownershipFindings, findings, verificationTier, subscriptionPeriod, providerName, checklist, reportDocument, photos, feedback]
 *       properties:
 *         id: { type: string, description: The verification request id., example: cm1vreq0001 }
 *         reportId: { type: string, description: The latest report's id., example: cm1vrep0001 }
 *         generatedAt: { type: string, format: date-time, nullable: true, example: "2026-10-05T12:00:00.000Z" }
 *         reviewStatus: { $ref: '#/components/schemas/ClientVerificationReportReviewStatus' }
 *         client:
 *           type: object
 *           description: The Client Information card.
 *           required: [name, phone, email]
 *           properties:
 *             name: { type: string, example: John Anderson }
 *             phone: { type: string, nullable: true, example: "+234 801 234 5678" }
 *             email: { type: string, example: john.anderson@email.com }
 *         property:
 *           type: object
 *           description: >
 *             Taken from the request details, with defaults ("Property", "Address not provided",
 *             "Not provided"). type, plotSize and builtYear fall back to the first finding whose
 *             label contains "type", "plot"/"size" or "year".
 *           required: [name, address, type, plotSize, builtYear]
 *           properties:
 *             name: { type: string, example: Lekki Gardens Block C }
 *             address: { type: string, example: "12 Admiralty Way, Lekki Phase 1, Lagos" }
 *             type: { type: string, example: COMPLETED_BUILDING }
 *             plotSize: { type: string, example: Not provided }
 *             builtYear: { type: string, example: "2019" }
 *         summary: { type: string, description: Empty string when the report has no summary., example: Property verified with no issues. }
 *         ownershipFindings:
 *           type: string
 *           description: >
 *             The value of the first finding whose label contains "ownership"; if findings is an
 *             array without such an entry, the whole findings array serialised as a JSON string;
 *             "Verification completed." when findings is not an array.
 *           example: Title matches the registered owner
 *         findings:
 *           description: Legacy findings array or tier-specific section results.
 *           oneOf:
 *             - type: array
 *               items: { $ref: '#/components/schemas/ClientVerificationFinding' }
 *             - $ref: '#/components/schemas/ClientVerificationTieredFindings'
 *         verificationTier: { $ref: '#/components/schemas/ClientVerificationReportTier' }
 *         subscriptionPeriod: { $ref: '#/components/schemas/ClientVerificationSubscriptionPeriod' }
 *         providerName: { type: string, enum: [Bonafide], example: Bonafide }
 *         checklist:
 *           type: array
 *           description: Tier-specific checklist results and evidence, or legacy checklist statuses.
 *           items: { $ref: '#/components/schemas/ClientVerificationReportChecklistItem' }
 *         reportDocument:
 *           allOf:
 *             - $ref: '#/components/schemas/ClientVerificationReportDocument'
 *           nullable: true
 *         photos:
 *           type: array
 *           description: Every media file on the report's checklist (or the assignment's checklist when the report has none), labelled with its checklist item.
 *           items:
 *             type: object
 *             required: [url, label]
 *             properties:
 *               url: { type: string, example: "https://res.cloudinary.com/demo/image/upload/front.jpg" }
 *               label: { type: string, example: Front elevation }
 *         feedback:
 *           type: object
 *           nullable: true
 *           description: The client's "Leave a Comment" feedback; null until they leave some.
 *           allOf:
 *             - $ref: '#/components/schemas/ClientVerificationReportFeedback'
 *     ClientVerificationReportFeedback:
 *       type: object
 *       required: [rating, comment, ratedAt]
 *       properties:
 *         rating: { type: integer, minimum: 1, maximum: 5, example: 4 }
 *         comment: { type: string, nullable: true, example: "Thorough inspection, thanks." }
 *         ratedAt: { type: string, format: date-time, example: "2026-10-08T14:02:11.000Z" }
 *     ClientVerificationReportHistoryItem:
 *       type: object
 *       required: [id, generatedAt, reviewStatus, viewed, providerName, verificationTier, subscriptionPeriod, findings, checklist, reportDocument, payment]
 *       properties:
 *         id: { type: string, example: cm1vrep0001 }
 *         generatedAt: { type: string, format: date-time, nullable: true, example: "2026-10-05T12:00:00.000Z" }
 *         reviewStatus: { $ref: '#/components/schemas/ClientVerificationReportReviewStatus' }
 *         viewed: { type: boolean, description: True when the report's viewedAt is set., example: false }
 *         providerName: { type: string, enum: [Bonafide], example: Bonafide }
 *         verificationTier: { $ref: '#/components/schemas/ClientVerificationReportTier' }
 *         subscriptionPeriod: { $ref: '#/components/schemas/ClientVerificationSubscriptionPeriod' }
 *         findings:
 *           description: Legacy findings array or tier-specific section results.
 *           oneOf:
 *             - type: array
 *               items: { $ref: '#/components/schemas/ClientVerificationFinding' }
 *             - $ref: '#/components/schemas/ClientVerificationTieredFindings'
 *         checklist:
 *           type: array
 *           items: { $ref: '#/components/schemas/ClientVerificationReportChecklistItem' }
 *         reportDocument:
 *           allOf:
 *             - $ref: '#/components/schemas/ClientVerificationReportDocument'
 *           nullable: true
 *         payment:
 *           type: object
 *           nullable: true
 *           description: The payment for the period this report covers; null for reports not linked to a transaction.
 *           required: [paidAt, amountInCents, currency]
 *           properties:
 *             paidAt: { type: string, format: date-time, nullable: true, example: "2026-10-01T08:05:00.000Z" }
 *             amountInCents: { type: integer, example: 5000000 }
 *             currency: { type: string, example: NGN }
 */

/**
 * @swagger
 * /api/{version}/client/services/verification/verification-types:
 *   get:
 *     tags: [Verification]
 *     summary: List the verification types of the "verification" service
 *     description: Returns the types ordered by creation date. Returns an empty array if the "verification" service does not exist.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     responses:
 *       200:
 *         description: Verification types (bare array, no envelope)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/ClientVerificationTypeCard' }
 *       500:
 *         description: Database error ("Internal server error.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/services/verification/verification-types", getVerificationTypes);

/**
 * @swagger
 * /api/{version}/client/verification-types/{slug}/plans:
 *   get:
 *     tags: [Verification]
 *     summary: List the plans for a verification type
 *     description: >
 *       Plans are ordered by creation date and include both regional prices. Read countryCode
 *       from GET /profile, use NGN/Paystack when it is NG, and USD/Stripe otherwise. The server
 *       enforces that mapping during checkout. An unknown slug returns an empty array, not 404.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: slug
 *         required: true
 *         description: Verification type slug
 *         schema: { type: string, example: property-verification }
 *     responses:
 *       200:
 *         description: Plans for the type (bare array, no envelope)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/ClientVerificationPlanCard' }
 *       500:
 *         description: Database error ("Internal server error.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification-types/:slug/plans", getVerificationTypesPlan);
router.get("/verification-pricing/catalogue", checkJwt, getVerificationPricingCatalog);
router.patch("/verification-requests/:id/pricing", checkJwt, patchVerificationRequestPricing);
router.post("/verification-requests/:id/quote", checkJwt, postVerificationRequestQuote);
router.get("/verification-requests/:id/quote", checkJwt, getVerificationRequestQuote);
router.get(
  "/verification-requests/:id/checkout-summary",
  checkJwt,
  getVerificationRequestCheckoutSummary,
);
router.post("/verification-requests/:id/quote/accept", checkJwt, acceptVerificationRequestQuote);

/**
 * @swagger
 * /api/{version}/client/verification-requests:
 *   post:
 *     tags: [Verification]
 *     summary: Create a draft verification request
 *     description: >
 *       Creates a request in DRAFT status for the authenticated user. The required `details`
 *       fields depend on the slug of the verification type identified by `verificationTypeId`
 *       (see ClientVerificationDetails). String values are trimmed and unknown keys are dropped.
 *       An empty or whitespace-only `additionalNote` is stored as null.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [verificationTypeId, details]
 *             properties:
 *               verificationTypeId:
 *                 type: string
 *                 minLength: 1
 *                 example: cm1vtype0001
 *               details:
 *                 description: >
 *                   construction-progress needs constructionAddress, projectType, currentConstructionStage;
 *                   business-verification needs businessName, businessType, businessAddress;
 *                   any other slug needs propertyType and propertyAddress (propertyName optional).
 *                   Every listed field must be a non-empty string.
 *                 oneOf:
 *                   - $ref: '#/components/schemas/ClientVerificationPropertyDetails'
 *                   - $ref: '#/components/schemas/ClientVerificationConstructionDetails'
 *                   - $ref: '#/components/schemas/ClientVerificationBusinessDetails'
 *               additionalNote:
 *                 type: string
 *                 example: Gate code is 1234
 *           example:
 *             verificationTypeId: cm1vtype0001
 *             details:
 *               propertyName: Lekki Gardens Block C
 *               propertyType: COMPLETED_BUILDING
 *               propertyAddress: 12 Admiralty Way, Lekki Phase 1, Lagos
 *             additionalNote: Gate code is 1234
 *     responses:
 *       201:
 *         description: Draft verification request created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClientVerificationRequestCreated' }
 *       400:
 *         description: >
 *           verificationTypeId is missing or blank ("Verification type is required."), no type has
 *           that id ("Verification type not found."), details is not an object or a required field
 *           is missing/blank (e.g. "propertyAddress is required and must be a non-empty string."),
 *           or additionalNote is not a string.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected error, including a malformed JSON body ("Internal server error.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/verification-requests", checkJwt, postVerificationRequest);

/**
 * @swagger
 * /api/{version}/client/verification-requests/reports-summary:
 *   get:
 *     tags: [Verification]
 *     summary: Count the authenticated user's unviewed verification reports
 *     description: Counts every report (any review status) on the user's requests whose viewedAt is null.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *     responses:
 *       200:
 *         description: Number of unviewed reports (no envelope)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClientVerificationReportsSummary' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Database error ("Internal server error.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification-requests/reports-summary", checkJwt, getVerificationReportSummary);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}:
 *   get:
 *     tags: [Verification]
 *     summary: Get one of the user's verification requests with its selected pricing
 *     description: Returns a legacy plan or the selected verification tier and optional monitoring plan. Requests owned by another user or with no selected pricing return 404.
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
 *         description: Verification request id
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Verification request (no envelope)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClientVerificationRequestDetail' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request does not exist or belongs to another user ("Verification request not found."), or neither a legacy plan nor a verification tier is selected ("Verification plan not selected.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Database error ("Internal server error.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification-requests/:id", checkJwt, getVerificationRequest);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}:
 *   patch:
 *     tags: [Verification]
 *     summary: Update a verification request's details or note
 *     description: >
 *       Send at least one of `details` or `additionalNote`. Only the detail fields sent are
 *       validated (non-empty strings, trimmed) and they are merged into the stored details;
 *       fields that don't belong to the request's verification type are dropped. An empty
 *       `additionalNote` clears it (stored as null). The request's status is not checked, so
 *       requests can be edited after payment.
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
 *         description: Verification request id
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               details:
 *                 type: object
 *                 description: >
 *                   Partial details. Accepted keys depend on the verification type slug:
 *                   construction-progress (constructionAddress, projectType, currentConstructionStage),
 *                   business-verification (businessName, businessType, businessAddress),
 *                   anything else (propertyName, propertyType, propertyAddress).
 *                 properties:
 *                   propertyName: { type: string, minLength: 1 }
 *                   propertyType: { type: string, minLength: 1 }
 *                   propertyAddress: { type: string, minLength: 1 }
 *                   constructionAddress: { type: string, minLength: 1 }
 *                   projectType: { type: string, minLength: 1 }
 *                   currentConstructionStage: { type: string, minLength: 1 }
 *                   businessName: { type: string, minLength: 1 }
 *                   businessType: { type: string, minLength: 1 }
 *                   businessAddress: { type: string, minLength: 1 }
 *               additionalNote:
 *                 type: string
 *                 example: Please call before arriving
 *           example:
 *             details:
 *               propertyAddress: 14 Admiralty Way, Lekki Phase 1, Lagos
 *             additionalNote: Please call before arriving
 *     responses:
 *       200:
 *         description: The updated verification request row (no envelope)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClientVerificationRequestRecord' }
 *       400:
 *         description: >
 *           Neither details nor additionalNote was sent, details is not an object, a sent detail
 *           field is blank or not a string, or additionalNote is not a string.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The request belongs to another user ("You cannot update this request.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request does not exist, or (when details are sent) its verification type no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected error, including a malformed JSON body ("Internal server error.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch("/verification-requests/:id", checkJwt, patchVerificationRequest);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/plan:
 *   patch:
 *     tags: [Verification]
 *     summary: Select a plan for a verification request
 *     description: The plan must belong to the request's verification type. The request's status is not checked or changed.
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
 *         description: Verification request id
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [verificationPlanId]
 *             properties:
 *               verificationPlanId:
 *                 type: string
 *                 minLength: 1
 *                 description: Trimmed before lookup.
 *                 example: cm1vplan0001
 *     responses:
 *       200:
 *         description: Plan selected (no envelope)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClientVerificationPlanSelection' }
 *       400:
 *         description: verificationPlanId is missing or blank ("Verification plan is required."), or the plan belongs to a different verification type
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The request belongs to another user ("You cannot update this request.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request ("Verification request not found.") or plan ("Verification plan not found.") does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected error, including a malformed JSON body ("Internal server error.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch("/verification-requests/:id/plan", checkJwt, patchVerificationRequestPlan);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/payment/initialize-paystack:
 *   post:
 *     tags: [Verification]
 *     summary: Start a Paystack checkout for a verification request
 *     description: >
 *       Only users with countryCode NG can use Paystack. The server always charges the plan's
 *       NGN price in kobo, regardless of client-supplied values. Users without a country must
 *       set it through PATCH /profile first. Only requests in DRAFT, PENDING_PAYMENT or PAYMENT_FAILED can be paid. If the latest
 *       transaction is PENDING and already has a Paystack checkout, that existing checkout is
 *       returned instead of creating a new one. Otherwise a PENDING transaction is reserved
 *       (a previous FAILED one is reused), a Paystack customer is created for the user if needed,
 *       and a Paystack session is created (with the plan's NGN paystack plan code for recurring plans);
 *       the request then moves to PENDING_PAYMENT. If initialization fails, the reserved
 *       transaction is marked FAILED.
 *     security:
 *       - bearerAuth: []
 *     x-no-body: true
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Verification request id
 *         schema: { type: string }
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     responses:
 *       200:
 *         description: Paystack checkout details (new or existing pending one; no envelope)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClientVerificationPaystackCheckout' }
 *       400:
 *         description: >
 *           The id is blank, the user has not set a country, the user is not in Nigeria, no plan is selected ("Select a verification plan before payment."),
 *           or the plan is recurring but has no Paystack plan code ("The selected plan is not
 *           configured in Paystack.").
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The request belongs to another user ("You cannot pay for this request.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: >
 *           The request's status is not payable, the latest transaction already succeeded
 *           ("This verification request has already been paid for."), a PENDING transaction
 *           uses another currency/provider, or a PENDING transaction without a complete checkout
 *           exists ("A payment is already being initialized for this request.").
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Paystack or database failure ("Unable to initialize payment.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(
  "/verification-requests/:id/payment/initialize-paystack",
  checkJwt,
  idempotent,
  initializeVerificationPaymentPaystack,
);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/payment/initialize-stripe:
 *   post:
 *     tags: [Verification]
 *     summary: Start a Stripe Checkout session for a verification request
 *     description: >
 *       Only users whose countryCode is not NG can use Stripe. The server always charges the
 *       plan's USD price in cents, regardless of client-supplied values. Users without a country
 *       must set it through PATCH /profile first. Only requests in DRAFT, PENDING_PAYMENT or PAYMENT_FAILED can be paid, and the plan must
 *       have a stripePriceId. If the latest transaction is PENDING and already has a checkout URL,
 *       that existing URL is returned. Otherwise a PENDING transaction is reserved (a previous
 *       FAILED one is reused) and a Stripe Checkout session is created in "payment" mode for
 *       ONE_TIME plans or "subscription" mode for recurring plans; the request then moves to
 *       PENDING_PAYMENT. If initialization fails, the reserved transaction is marked FAILED.
 *     security:
 *       - bearerAuth: []
 *     x-no-body: true
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Verification request id
 *         schema: { type: string }
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     responses:
 *       200:
 *         description: Stripe Checkout URL (new or existing pending one; no envelope)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClientVerificationStripeCheckout' }
 *       400:
 *         description: >
 *           The id is blank, the user has not set a country, the user is in Nigeria, no plan is selected ("Select a verification plan before payment."),
 *           or the plan has no Stripe price ("The selected plan is not configured in Stripe.").
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The request belongs to another user ("You cannot pay for this request.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: >
 *           The request's status is not payable, the latest transaction already succeeded, a
 *           PENDING transaction uses another currency/provider, or a PENDING transaction without
 *           a checkout URL exists (payment already being initialized).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Stripe or database failure ("Unable to initialize payment.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(
  "/verification-requests/:id/payment/initialize-stripe",
  checkJwt,
  idempotent,
  initializeVerificationPaymentStripe,
);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/documents:
 *   post:
 *     tags: [Verification]
 *     summary: Upload a document for a verification request
 *     description: >
 *       Uploads one file to Cloudinary and records it against the request. No size or type limit
 *       is enforced by the server; PDFs (application/pdf) are uploaded as raw files and everything
 *       else as an image, so non-image, non-PDF files are rejected by Cloudinary (500). The
 *       request's status is not checked.
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
 *         description: Verification request id
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Exactly one file (an image or a PDF). Any other form field name causes a 500.
 *     responses:
 *       201:
 *         description: Document uploaded (no envelope)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClientVerificationDocument' }
 *       400:
 *         description: No file was sent ("A file is required."), or the id is blank
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The request belongs to another user ("You cannot upload to this request.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Cloudinary upload or database failure, or a multer error such as an unexpected file field ("Internal server error.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(
  "/verification-requests/:id/documents",
  checkJwt,
  upload.single("file"),
  postVerificationDocuments,
);

/**
 * @swagger
 * /api/{version}/client/verification-requests:
 *   get:
 *     tags: [Verification]
 *     summary: List the authenticated user's most recently updated verification requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string, enum: [v1], default: v1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Number of requests to return (integer from 1 to 50)
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 5 }
 *     responses:
 *       200:
 *         description: Requests sorted by updatedAt, newest first (bare array, no envelope)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/ClientVerificationRequestListItem' }
 *       400:
 *         description: limit is not an integer between 1 and 50 ("Limit must be an integer between 1 and 50.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Database error ("Internal server error.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification-requests", checkJwt, getVerificationRequests);

router.get("/verification-requests/reports-summary", checkJwt, getVerificationReportSummary);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/tracking:
 *   get:
 *     tags: [Verification]
 *     summary: Get tracking progress for one of the user's verification requests
 *     description: Requests owned by another user return 404.
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
 *         description: Verification request id
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Tracking information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [status, message, data]
 *               properties:
 *                 status: { type: string, enum: [success], example: success }
 *                 message: { type: string, example: Tracking information retrieved successfully }
 *                 data: { $ref: '#/components/schemas/ClientVerificationTracking' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request does not exist or belongs to another user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Database error ("Internal server error")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification-requests/:id/tracking", checkJwt, getVerificationRequestTracking);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/notification-preferences:
 *   patch:
 *     tags: [Verification]
 *     summary: Update notification preferences for a verification request
 *     description: Send at least one boolean; non-boolean values are ignored. Requests owned by another user return 404 (checked before the body is validated).
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
 *         description: Verification request id
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               notifyOnInspectionStart: { type: boolean, example: true }
 *               notifyOnReportReady: { type: boolean, example: false }
 *     responses:
 *       200:
 *         description: Preferences after the update
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [status, message, data]
 *               properties:
 *                 status: { type: string, enum: [success], example: success }
 *                 message: { type: string, example: Notification preferences updated successfully }
 *                 data: { $ref: '#/components/schemas/ClientVerificationNotificationPreferences' }
 *       400:
 *         description: Neither preference was sent as a boolean ("At least one notification preference must be provided as a boolean.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request does not exist or belongs to another user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Database error or malformed JSON body ("Internal server error")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch(
  "/verification-requests/:id/notification-preferences",
  checkJwt,
  patchVerificationRequestNotificationPreferences,
);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/report-summary:
 *   get:
 *     tags: [Verification]
 *     summary: Get a summary of the latest report for one of the user's verification requests
 *     description: >
 *       Recurring requests have one report per paid period; this summarises the most recently
 *       generated one. The response includes the five fixed checklist sections and the uploaded
 *       PDF's `reportDocument` metadata (null if no report document exists). Returns 200 with
 *       empty insights and a null inspectionDate when no report exists yet. The report's review
 *       status is not checked, and the report is not marked as viewed. Requests owned by another
 *       user return 404.
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
 *         description: Verification request id
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Report summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [status, message, data]
 *               properties:
 *                 status: { type: string, enum: [success], example: success }
 *                 message: { type: string, example: Report summary retrieved successfully }
 *                 data: { $ref: '#/components/schemas/ClientVerificationReportSummary' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request does not exist or belongs to another user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Database error ("Internal server error")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(
  "/verification-requests/:id/report-summary",
  checkJwt,
  getVerificationRequestReportSummary,
);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/report/full:
 *   get:
 *     tags: [Verification]
 *     summary: Get the full latest report for a verification request
 *     description: >
 *       Returns the most recently generated report (recurring requests have one report per paid
 *       period), for the client who owns the request. The response includes the five fixed
 *       checklist sections and `reportDocument` metadata for the uploaded PDF (nullable for older
 *       reports without a stored report document). The report's review status is not checked and
 *       the report is not marked as viewed. The frontend builds the downloadable PDF from this.
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
 *         description: Verification request id
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [status, message, data]
 *               properties:
 *                 status: { type: string, enum: [success], example: success }
 *                 message: { type: string, example: Full report retrieved successfully }
 *                 data: { $ref: '#/components/schemas/ClientVerificationFullReport' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The request belongs to another user ("You cannot view this report.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request does not exist or has no report yet ("Verification report not found.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Database error ("Internal server error")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification-requests/:id/report/full", checkJwt, getVerificationRequestFullReport);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/report/comment:
 *   post:
 *     tags: [Verification]
 *     summary: Rate and comment on the latest report ("Leave a Comment")
 *     description: >
 *       Saves the client's rating and comment on the request's latest report (the one the full
 *       report shows). Sending it again overwrites both. The agent is not notified.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: string, enum: [v1], default: v1 } }
 *       - { in: path, name: id, required: true, description: Verification request id, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5, example: 4 }
 *               comment: { type: string, maxLength: 1000, description: Optional; blank clears it., example: "Thorough inspection, thanks." }
 *     responses:
 *       200:
 *         description: The saved feedback.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reportId: { type: string, example: cm1vrep0001 }
 *                 rating: { type: integer, example: 4 }
 *                 comment: { type: string, nullable: true, example: "Thorough inspection, thanks." }
 *                 ratedAt: { type: string, format: date-time }
 *       400:
 *         description: rating is not a whole number from 1 to 5, or comment is not a string or is too long
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: The request belongs to another user ("You cannot comment on this report.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request does not exist or has no report yet
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Database error ("Internal server error.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(
  "/verification-requests/:id/report/comment",
  checkJwt,
  postVerificationRequestReportComment,
);

/**
 * @swagger
 * /api/{version}/client/verification-requests/{id}/reports:
 *   get:
 *     tags: [Verification]
 *     summary: List every report for one of the user's verification requests
 *     description: >
 *       Recurring (monthly or quarterly) requests get one report per paid period; one-time
 *       requests have at most one. Reports are returned newest first (by generatedAt, then
 *       createdAt), whatever their review status. Each history item includes the five fixed
 *       checklist sections and the uploaded PDF's `reportDocument` metadata (nullable when absent).
 *       Requests owned by another user return 404.
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
 *         description: Verification request id
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Report history (empty array if no reports yet)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [status, message, data]
 *               properties:
 *                 status: { type: string, enum: [success], example: success }
 *                 message: { type: string, example: Verification reports retrieved successfully }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/ClientVerificationReportHistoryItem' }
 *       401:
 *         description: Missing, invalid or expired token, or the token's user no longer exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: The request does not exist or belongs to another user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Database error ("Internal server error.")
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/verification-requests/:id/reports", checkJwt, getVerificationRequestReports);

export default router;
