import express from "express";
import { paystackWebhook, callback_url } from "./paystack";
import { stripeWebhook } from "./stripe";

const webHookRouter = express.Router();

webHookRouter.post("/paystack", paystackWebhook);
webHookRouter.get("/paystack/callback", callback_url);
webHookRouter.post("/stripe", stripeWebhook);

export default webHookRouter;
