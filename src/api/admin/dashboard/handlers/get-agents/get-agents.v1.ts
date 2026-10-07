import { AgentStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import {
  listVerificationAgents,
  MAX_ACTIVE_ASSIGNMENTS,
} from "../../../authentication/services/database/agent";

const tabs = ["all", "active", "busy"] as const;

const displayStatusOf = (status: AgentStatus, activeAssignments: number) =>
  status === AgentStatus.INACTIVE
    ? "SUSPENDED"
    : activeAssignments >= MAX_ACTIVE_ASSIGNMENTS
      ? "BUSY"
      : "AVAILABLE";

/** The Agents page: all agents, available ("active") ones, or fully booked ("busy") ones. */
export const getAgentsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const tab = (req.query.tab ?? "all") as (typeof tabs)[number];
  if (!tabs.includes(tab)) return next(new BadRequestError("tab must be all, active or busy."));
  try {
    const agents = (await listVerificationAgents(String(req.query.search ?? ""))).map(
      ({ user, _count, ...agent }) => ({
        ...agent,
        email: user.email,
        avatarUrl: user.profilePhoto,
        activeAssignments: _count.assignments,
        displayStatus: displayStatusOf(agent.status, _count.assignments),
      }),
    );
    const count = (displayStatus: string) =>
      agents.filter((agent) => agent.displayStatus === displayStatus).length;

    res.status(HttpStatusCode.OK).json({
      data:
        tab === "all"
          ? agents
          : agents.filter(
              (agent) => agent.displayStatus === (tab === "busy" ? "BUSY" : "AVAILABLE"),
            ),
      counts: {
        all: agents.length,
        active: count("AVAILABLE"),
        busy: count("BUSY"),
        suspended: count("SUSPENDED"),
      },
    });
  } catch (error) {
    logger.error(`Error listing agents: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
