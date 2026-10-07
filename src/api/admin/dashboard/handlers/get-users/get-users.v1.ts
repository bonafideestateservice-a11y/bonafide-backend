import { AgentStatus, UserStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { parsePaging } from "../../../../../utils/validations";
import { getUsers, UserListType } from "../../services/database/user";

const types: UserListType[] = ["all", "client", "agent"];

/** The User Management page. */
export const getUsersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const type = (req.query.type ?? "all") as UserListType;
  const paging = parsePaging(req.query);
  if (!types.includes(type)) return next(new BadRequestError("type must be all, client or agent."));
  if (!paging) {
    return next(new BadRequestError("page and limit must be positive integers (limit ≤ 100)."));
  }
  try {
    const result = await getUsers(type, String(req.query.search ?? ""), paging.page, paging.limit);
    res.status(HttpStatusCode.OK).json({
      ...result,
      data: result.data.map(({ verificationAgent: agent, ...user }) => ({
        id: user.id,
        // Agents' profiles are at /admin/agents/{agentId}.
        agentId: agent?.id ?? null,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.profilePhoto,
        type: user.role,
        status:
          user.status === UserStatus.SUSPENDED || agent?.status === AgentStatus.INACTIVE
            ? UserStatus.SUSPENDED
            : UserStatus.ACTIVE,
        joinedAt: user.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error(`Error getting users: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
