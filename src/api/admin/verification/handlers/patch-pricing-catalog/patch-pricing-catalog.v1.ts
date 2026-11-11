import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import {
  ActivateProviderPriceVersionsData,
  activateProviderPriceVersionsBatch,
  getVerificationPricingCatalogue,
  ProviderPriceTarget,
} from "../../../../services/database/pricing";
import { usdCentsToNgnKobo } from "../../../../services/pricing-calculation";
import { syncProviderPrices } from "../../../../services/provider-price-sync";
import { logger } from "../../../../../utils/logger";

const parsePositiveRate = (value: unknown) => {
  if (value === undefined || value === null) return null;

  if (typeof value !== "number" && typeof value !== "string") {
    throw new BadRequestError("usdToNgnRate must be a positive number or numeric string.");
  }
  const trimmed = value.toString().trim();
  if (!trimmed) {
    throw new BadRequestError("usdToNgnRate is required when provided.");
  }

  let rate: Prisma.Decimal;
  try {
    rate = new Prisma.Decimal(trimmed);
  } catch {
    throw new BadRequestError("usdToNgnRate must be a positive number.");
  }
  if (!rate.isFinite() || !rate.greaterThan(0)) {
    throw new BadRequestError("usdToNgnRate must be a positive number.");
  }
  return rate;
};

const parseUpdates = (
  value: unknown,
  label: "Tier" | "Monitoring plan",
): Array<{ id: string; priceUsdCents: number }> => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestError(`${label} updates must be an array.`);
  }

  const seenIds = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new BadRequestError(`${label} updates must include an id and USD price.`);
    }

    const update = item as { id?: unknown; priceUsdCents?: unknown };
    const id = typeof update.id === "string" ? update.id.trim() : "";
    const priceUsdCents =
      typeof update.priceUsdCents === "number"
        ? update.priceUsdCents
        : Number(update.priceUsdCents);
    if (!id) {
      throw new BadRequestError(`${label} id is required for catalogue updates.`);
    }
    if (seenIds.has(id)) {
      throw new BadRequestError(`${label} ${id} is included more than once.`);
    }
    if (!Number.isSafeInteger(priceUsdCents) || priceUsdCents <= 0) {
      throw new BadRequestError(`${label} ${id} has an invalid USD price.`);
    }
    seenIds.add(id);
    return { id, priceUsdCents };
  });
};

interface TierUpdate {
  id: string;
  priceUsdCents?: number;
  minQuoteUsdCents?: number;
  maxQuoteUsdCents?: number;
}

const parseTierUpdates = (value: unknown): TierUpdate[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestError("Tier updates must be an array.");
  }

  const seenIds = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new BadRequestError("Tier updates must include an id and price or quote range.");
    }

    const update = item as Record<string, unknown>;
    const id = typeof update.id === "string" ? update.id.trim() : "";
    if (!id) {
      throw new BadRequestError("Tier id is required for catalogue updates.");
    }
    if (seenIds.has(id)) {
      throw new BadRequestError(`Tier ${id} is included more than once.`);
    }

    const parsed: TierUpdate = { id };
    for (const field of ["priceUsdCents", "minQuoteUsdCents", "maxQuoteUsdCents"] as const) {
      if (update[field] === undefined) continue;
      const amount = typeof update[field] === "number" ? update[field] : Number(update[field]);
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new BadRequestError(`Tier ${id} has an invalid ${field}.`);
      }
      parsed[field] = amount;
    }
    if (
      parsed.priceUsdCents === undefined &&
      parsed.minQuoteUsdCents === undefined &&
      parsed.maxQuoteUsdCents === undefined
    ) {
      throw new BadRequestError(`Tier ${id} must include a price or quote range update.`);
    }
    if (
      parsed.priceUsdCents !== undefined &&
      (parsed.minQuoteUsdCents !== undefined || parsed.maxQuoteUsdCents !== undefined)
    ) {
      throw new BadRequestError(`Tier ${id} cannot update a fixed price and quote range together.`);
    }

    seenIds.add(id);
    return parsed;
  });
};

export const patchAdminPricingCatalog = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customReq = req as CustomRequest;
    const userId = customReq.user?.id ?? customReq.token?.id;

    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }

    const body = (req.body ?? {}) as {
      usdToNgnRate?: unknown;
      tiers?: unknown;
      monitoringPlans?: unknown;
    };
    const proposedRate = parsePositiveRate(body.usdToNgnRate);
    const tierUpdates = parseTierUpdates(body.tiers);
    const monitoringUpdates = parseUpdates(body.monitoringPlans, "Monitoring plan");
    const catalogue = await getVerificationPricingCatalogue();
    const currentRate = catalogue.pricingSettings?.usdToNgnRate ?? null;
    const nextRate = proposedRate ?? currentRate;
    const rateChanged = !!proposedRate && (!currentRate || !proposedRate.equals(currentRate));
    if (!rateChanged && !tierUpdates.length && !monitoringUpdates.length) {
      throw new BadRequestError("At least one pricing change is required.");
    }

    const syncTargets = new Map<string, { target: ProviderPriceTarget; usdAmountCents: number }>();
    const quoteRangeUpdates: {
      id: string;
      minQuoteUsdCents: number;
      maxQuoteUsdCents: number;
    }[] = [];
    const addTier = (id: string, priceUsdCents: number) => {
      syncTargets.set(`tier:${id}`, {
        target: { verificationTierId: id },
        usdAmountCents: priceUsdCents,
      });
    };
    const addPlan = (id: string, priceUsdCents: number) => {
      syncTargets.set(`monitoring:${id}`, {
        target: { monitoringPlanId: id },
        usdAmountCents: priceUsdCents,
      });
    };

    if (rateChanged) {
      for (const tier of catalogue.tiers) {
        if (!tier.quoteRequired) {
          const priceUsdCents = tier.priceUsdCents;
          if (
            priceUsdCents === null ||
            !Number.isSafeInteger(priceUsdCents) ||
            priceUsdCents <= 0
          ) {
            throw new BadRequestError(`Tier ${tier.id} has no valid USD price to sync.`);
          }
          addTier(tier.id, priceUsdCents);
        }
      }
      for (const plan of catalogue.monitoringPlans) {
        if (!Number.isSafeInteger(plan.priceUsdCents) || plan.priceUsdCents <= 0) {
          throw new BadRequestError(`Monitoring plan ${plan.id} has no valid USD price to sync.`);
        }
        addPlan(plan.id, plan.priceUsdCents);
      }
    }

    for (const update of tierUpdates) {
      const tier = catalogue.tiers.find(
        (candidate) => candidate.id === update.id && candidate.active,
      );
      if (!tier) {
        throw new BadRequestError(`Tier ${update.id} was not found or is not editable.`);
      }
      if (update.priceUsdCents !== undefined) {
        if (tier.quoteRequired) {
          throw new BadRequestError(`Tier ${update.id} does not have an editable fixed price.`);
        }
        addTier(update.id, update.priceUsdCents);
      } else {
        if (!tier.quoteRequired) {
          throw new BadRequestError(`Tier ${update.id} does not have an editable quote range.`);
        }
        const minQuoteUsdCents = update.minQuoteUsdCents ?? tier.minQuoteUsdCents;
        const maxQuoteUsdCents = update.maxQuoteUsdCents ?? tier.maxQuoteUsdCents;
        if (
          !Number.isSafeInteger(minQuoteUsdCents) ||
          !Number.isSafeInteger(maxQuoteUsdCents) ||
          minQuoteUsdCents === null ||
          maxQuoteUsdCents === null ||
          minQuoteUsdCents <= 0 ||
          maxQuoteUsdCents < minQuoteUsdCents
        ) {
          throw new BadRequestError(`Tier ${update.id} has an invalid Premium quote range.`);
        }
        quoteRangeUpdates.push({
          id: tier.id,
          minQuoteUsdCents,
          maxQuoteUsdCents,
        });
      }
    }

    for (const update of monitoringUpdates) {
      const plan = catalogue.monitoringPlans.find(
        (candidate) => candidate.id === update.id && candidate.active,
      );
      if (!plan) {
        throw new BadRequestError(`Monitoring plan ${update.id} was not found or is not editable.`);
      }
      addPlan(update.id, update.priceUsdCents);
    }

    if (syncTargets.size && !nextRate) {
      throw new BadRequestError("Set usdToNgnRate before syncing prices to Stripe and Paystack.");
    }

    const activations: ActivateProviderPriceVersionsData[] = [];
    for (const { target, usdAmountCents } of syncTargets.values()) {
      if (!nextRate) {
        throw new BadRequestError("Set usdToNgnRate before syncing prices to Stripe and Paystack.");
      }
      const synced = await syncProviderPrices(
        {
          target,
          usdAmountCents,
          ngnAmountKobo: usdCentsToNgnKobo(usdAmountCents, nextRate),
        },
        { activate: false },
      );
      activations.push(synced.activationData);
    }

    await activateProviderPriceVersionsBatch({
      activations,
      ...(quoteRangeUpdates.length ? { quoteRanges: quoteRangeUpdates } : {}),
      ...(rateChanged && proposedRate
        ? { pricingSettings: { usdToNgnRate: proposedRate, updatedById: userId } }
        : {}),
    });

    const settings = await getVerificationPricingCatalogue();
    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: syncTargets.size
        ? "Pricing updated and synced to Stripe and Paystack for future checkouts."
        : "Pricing catalogue updated.",
      data: {
        pricingSettings: settings.pricingSettings
          ? {
              ...settings.pricingSettings,
              usdToNgnRate: settings.pricingSettings.usdToNgnRate.toString(),
            }
          : null,
        syncedTargets: syncTargets.size,
        existingSubscriptionsUpdated: false,
      },
    });
  } catch (error) {
    logger.error(`Error updating admin pricing catalog: ${error}`);
    if (error instanceof BadRequestError) {
      return next(error);
    }
    next(
      new ApiError(
        HttpStatusCode.INTERNAL_SERVER,
        "Unable to sync pricing with payment providers.",
      ),
    );
  }
};

export default patchAdminPricingCatalog;
