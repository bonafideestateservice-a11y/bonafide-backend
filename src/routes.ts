import { Router, Request, Response } from "express";

import clientAuthenticationRoutes from "./api/client/authentication";
import clientVerificationRoutes from "./api/client/verification";
import adminAuthenticationRoutes from "./api/admin/authentication";
import adminVerificationRoutes from "./api/admin/verification";
import webhookRoutes from "./api/webhooks";

const router = Router();

const healthCheckHandler = (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", data: { uptime: process.uptime() } });
};

router.get("/healthcheck", healthCheckHandler);
router.use("/:version/client", clientAuthenticationRoutes);
router.use("/:version/client", clientVerificationRoutes);
router.use("/:version/admin", adminAuthenticationRoutes);
router.use("/:version/admin", adminVerificationRoutes);
router.use("/:version/webhook", webhookRoutes);

export default router;
