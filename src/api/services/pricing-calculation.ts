import { Prisma } from "@prisma/client";

export const usdCentsToNgnKobo = (usdAmountCents: number, usdToNgnRate: Prisma.Decimal) => {
  if (!Number.isSafeInteger(usdAmountCents) || usdAmountCents <= 0) {
    throw new Error("USD amount must be a positive safe integer");
  }
  if (!usdToNgnRate.isFinite() || !usdToNgnRate.greaterThan(0)) {
    throw new Error("USD to NGN rate must be a positive finite decimal");
  }

  const ngnKobo = new Prisma.Decimal(usdAmountCents)
    .mul(usdToNgnRate)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  const ngnKoboNumber = ngnKobo.toNumber();
  if (!Number.isSafeInteger(ngnKoboNumber)) {
    throw new Error("Converted NGN amount exceeds the safe integer range");
  }
  return ngnKoboNumber;
};
