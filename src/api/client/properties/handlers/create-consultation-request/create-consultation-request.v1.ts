import { PropertyRequestType } from "@prisma/client";
import { createRequestHandler } from "../shared";

/** "Request consultation". Returns the client's open consultation request if one exists. */
export const createConsultationRequestHandler = createRequestHandler(
  PropertyRequestType.CONSULTATION,
);
