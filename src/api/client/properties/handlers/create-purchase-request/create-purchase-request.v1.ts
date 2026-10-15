import { PropertyRequestType } from "@prisma/client";
import { createRequestHandler } from "../shared";

/** "Submit purchase request". Returns the client's open purchase request if one exists. */
export const createPurchaseRequestHandler = createRequestHandler(PropertyRequestType.PURCHASE);
