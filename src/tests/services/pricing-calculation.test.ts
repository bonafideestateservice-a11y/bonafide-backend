import { Prisma } from "@prisma/client";
import { usdCentsToNgnKobo } from "../../api/services/pricing-calculation";

describe("USD to NGN price conversion", () => {
  it("calculates kobo from cents and rounds to the nearest kobo", () => {
    expect(usdCentsToNgnKobo(2500, new Prisma.Decimal("1500"))).toBe(3750000);
    expect(usdCentsToNgnKobo(1, new Prisma.Decimal("1.5"))).toBe(2);
  });

  it("rejects invalid USD amounts and exchange rates", () => {
    expect(() => usdCentsToNgnKobo(0, new Prisma.Decimal("1500"))).toThrow(
      "USD amount must be a positive safe integer",
    );
    expect(() => usdCentsToNgnKobo(100, new Prisma.Decimal("0"))).toThrow(
      "USD to NGN rate must be a positive finite decimal",
    );
  });
});
