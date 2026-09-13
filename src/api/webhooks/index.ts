import { Router, Request, Response } from "express";

import { HttpStatusCode } from "../../exceptions";

const router = Router();

/**
 * @swagger
 * /api/{version}/webhook/payments:
 *   post:
 *     tags: [Webhooks]
 *     summary: Handle payment provider webhooks
 *     security: []
 *     parameters:
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Webhook acknowledged
 */
router.post("/payments", (req: Request, res: Response) => {
  // TODO: implement webhook signature verification
  // TODO: dispatch req.body.event and req.body.data to handlers

  res.status(HttpStatusCode.OK).json({ status: "ok", received: true });
});

export default router;