import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { getVerificationPricingCatalogue } from "../../../../services/database/pricing";
import { usdCentsToNgnKobo } from "../../../../services/pricing-calculation";

export const getAdminPricingCatalog = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const catalogue = await getVerificationPricingCatalogue();
    const fxRate = catalogue.pricingSettings?.usdToNgnRate;

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Admin pricing catalog retrieved successfully",
      data: {
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
      },
    });
  } catch (error) {
    logger.error(`Error getting admin pricing catalog: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getAdminPricingCatalog;
