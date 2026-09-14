import { Router, Request, Response } from "express";

import clientAuthenticationRoutes from "./api/client/authentication";
import adminAuthenticationRoutes from "./api/admin/authentication";
import webhookRoutes from "./api/webhooks";

const router = Router();

const healthCheckHandler = (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", data: { uptime: process.uptime() } });
};

router.get("/healthcheck", healthCheckHandler);
router.use("/:version/client", clientAuthenticationRoutes);
router.use("/:version/admin", adminAuthenticationRoutes);
router.use("/:version/webhook", webhookRoutes);

export default router;