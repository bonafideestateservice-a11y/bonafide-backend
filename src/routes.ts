import { Router, Request, Response } from "express";

import authenticationRoutes from "./api/authentication";
import adminRoutes from "./api/admin";
import clientRoutes from "./api/client";
import webhookRoutes from "./api/webhooks";

const router = Router();

const healthCheckHandler = (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", data: { uptime: process.uptime() } });
};

router.get("/healthcheck", healthCheckHandler);

router.use("/:version/auth", authenticationRoutes);
router.use("/:version/admin", adminRoutes);
router.use("/:version/client", clientRoutes);
router.use("/:version/webhook", webhookRoutes);

export default router;