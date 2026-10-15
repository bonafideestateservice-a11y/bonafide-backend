import { PropertyAmenity, PropertyType } from "@prisma/client";
import { Request, Response } from "express";
import { HttpStatusCode } from "../../../../../exceptions";

/** "AIR_CONDITIONING" → "Air Conditioning". */
const labelOf = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

const toOptions = (values: string[]) => values.map((value) => ({ value, label: labelOf(value) }));

/** The choices for the Add/Edit Property form, so the frontend doesn't hard-code them. */
export const getPropertyOptionsHandler = (_req: Request, res: Response): void => {
  res.status(HttpStatusCode.OK).json({
    types: toOptions(Object.values(PropertyType)),
    amenities: toOptions(Object.values(PropertyAmenity)),
  });
};
