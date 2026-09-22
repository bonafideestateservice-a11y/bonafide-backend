import { NextFunction, Request, Response } from "express";
import { BadRequestError, ApiError, HttpStatusCode } from "../../../../../exceptions";
import {
  getVerificationRequestsForAdmin,
  VerificationRequestListStatus,
  VerificationRequestSortBy,
  VerificationRequestSortOrder,
} from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";

const statuses: VerificationRequestListStatus[] = [
  "all",
  "pending",
  "assigned",
  "in_progress",
  "completed",
];
const sortFields: VerificationRequestSortBy[] = ["createdAt", "status"];
const sortOrders: VerificationRequestSortOrder[] = ["asc", "desc"];

const parsePositiveInteger = (value: unknown, name: string, defaultValue: number): number => {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestError(`${name} must be a positive integer.`);
  }
  return parsed;
};

const getStringQuery = (value: unknown, name: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new BadRequestError(`${name} must be a string.`);
  return value;
};

const getAddressParts = (details: unknown) => {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return { city: null, country: null };
  }
  const values = details as Record<string, unknown>;
  const location = values.location;
  if (location && typeof location === "object" && !Array.isArray(location)) {
    const locationValues = location as Record<string, unknown>;
    return {
      city: typeof locationValues.city === "string" ? locationValues.city : null,
      country: typeof locationValues.country === "string" ? locationValues.country : null,
    };
  }
  const address = [values.city, values.country].every((value) => typeof value === "string")
    ? `${values.city}, ${values.country}`
    : [values.propertyAddress, values.constructionAddress, values.businessAddress].find(
        (value): value is string => typeof value === "string",
      );
  const [city, country] = typeof address === "string" ? address.split(",", 2) : [];
  return { city: city?.trim() || null, country: country?.trim() || null };
};

const getDisplayStatus = (
  request: Awaited<ReturnType<typeof getVerificationRequestsForAdmin>>["data"][number],
) => {
  if (request.agentAssignment?.status === "ASSIGNED") return "ASSIGNED";
  if (["DRAFT", "PENDING_PAYMENT", "SUBMITTED"].includes(request.status)) return "PENDING";
  if (
    request.status === "IN_PROGRESS" ||
    request.agentAssignment?.status === "ACCEPTED" ||
    request.agentAssignment?.status === "INSPECTION_SCHEDULED"
  ) {
    return "IN_PROGRESS";
  }
  return request.status;
};

export const getVerificationRequestsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const status = req.query.status === undefined ? "all" : req.query.status;
    if (typeof status !== "string" || !statuses.includes(status as VerificationRequestListStatus)) {
      throw new BadRequestError(`Status must be one of: ${statuses.join(", ")}.`);
    }

    const search = getStringQuery(req.query.search, "search") ?? "";
    const agentId = getStringQuery(req.query.agentId, "agentId");
    const propertyType = getStringQuery(req.query.propertyType, "propertyType");
    const sortBy = getStringQuery(req.query.sortBy, "sortBy") ?? "createdAt";
    const sortOrder = getStringQuery(req.query.sortOrder, "sortOrder") ?? "desc";
    if (!sortFields.includes(sortBy as VerificationRequestSortBy)) {
      throw new BadRequestError("sortBy must be createdAt or status.");
    }
    if (!sortOrders.includes(sortOrder as VerificationRequestSortOrder)) {
      throw new BadRequestError("sortOrder must be asc or desc.");
    }

    const page = parsePositiveInteger(req.query.page, "page", 1);
    const limit = parsePositiveInteger(req.query.limit, "limit", 10);
    if (limit > 100) throw new BadRequestError("limit must not exceed 100.");

    const result = await getVerificationRequestsForAdmin({
      status: status as VerificationRequestListStatus,
      search,
      agentId,
      propertyType,
      page,
      limit,
      sortBy: sortBy as VerificationRequestSortBy,
      sortOrder: sortOrder as VerificationRequestSortOrder,
    });

    res.status(HttpStatusCode.OK).json({
      ...result,
      data: result.data.map((request) => {
        const details = request.details as Record<string, unknown>;
        const location = getAddressParts(request.details);
        return {
          id: request.id,
          client: {
            id: request.user.id,
            name: request.user.fullName,
            avatarUrl: request.user.profilePhoto,
          },
          propertyType:
            typeof details.propertyType === "string"
              ? details.propertyType
              : request.verificationType.name,
          location,
          status: getDisplayStatus(request),
          agent: request.agentAssignment?.agent
            ? { id: request.agentAssignment.agent.id, name: request.agentAssignment.agent.name }
            : null,
          createdAt: request.createdAt.toISOString(),
        };
      }),
    });
  } catch (error) {
    if (error instanceof BadRequestError) return next(error);
    logger.error(`Error getting admin verification requests: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getVerificationRequestsHandler;
