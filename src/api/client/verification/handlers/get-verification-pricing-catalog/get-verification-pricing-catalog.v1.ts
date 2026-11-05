import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import { getVerificationPricingCatalogue } from "../../../../services/database/pricing";
import { usdCentsToNgnKobo } from "../../../../services/pricing-calculation";
import { logger } from "../../../../../utils/logger";

export const getVerificationPricingCatalog = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const catalogue = await getVerificationPricingCatalogue();
    const fxRate = catalogue.pricingSettings?.usdToNgnRate;
    const response = {
      tiers: catalogue.tiers.map((tier) => ({
        ...tier,
        priceNgnKobo:
          tier.priceUsdCents === null || !fxRate
            ? null
            : usdCentsToNgnKobo(tier.priceUsdCents, fxRate),
      })),
      monitoringPlans: catalogue.monitoringPlans.map((plan) => ({
        ...plan,
        priceNgnKobo: fxRate ? usdCentsToNgnKobo(plan.priceUsdCents, fxRate) : null,
      })),
      pricingSettings: catalogue.pricingSettings
        ? {
            ...catalogue.pricingSettings,
            usdToNgnRate: catalogue.pricingSettings.usdToNgnRate.toString(),
          }
        : null,
    };

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Verification pricing catalog retrieved successfully",
      data: response,
    });
  } catch (error) {
    logger.error(`Error getting verification pricing catalog: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getVerificationPricingCatalog;
