// Disabled until the plan currency is sorted out: Paystack rejects the plans because they are
// priced in USD ("USD not a supported currency"). Uncomment once the plans have a currency
// Paystack accepts, then run `npm run paystack:plans`.
//
// import dotenv from "dotenv";
// import { VERIFICATION_FREQUENCY } from "@prisma/client";
// import { createPaystackPlan, listPaystackPlans } from "../src/libs/paystack/paystack";
// import { prismaClient } from "../src/utils/prisma";
// import { logger } from "../src/utils/logger";
//
// dotenv.config({ path: "./src/.env" });
//
// const intervalByFrequency: Partial<Record<VERIFICATION_FREQUENCY, string>> = {
//   [VERIFICATION_FREQUENCY.MONTHLY]: "monthly",
//   [VERIFICATION_FREQUENCY.QUARTERLY]: "quarterly",
// };
//
// async function listAllPaystackPlans() {
//   const plans = [];
//   for (let page = 1; ; page += 1) {
//     const pagePlans = await listPaystackPlans(page, 100);
//     plans.push(...pagePlans);
//     if (pagePlans.length < 100) return plans;
//   }
// }
//
// /**
//  * Creates a Paystack plan for each recurring verification plan and saves its plan code.
//  * Safe to re-run: a Paystack plan already made for a verification plan (matched by the
//  * "verification_plan_id=..." description) is reused, and its code saved if missing.
//  */
//
// async function setupPaystackPlans() {
//   if (!process.env.PAYSTACK_SECRET_KEY) {
//     throw new Error("PAYSTACK_SECRET_KEY is required");
//   }
//
//   const verificationPlans = await prismaClient.verificationPlan.findMany({
//     include: { verificationType: true },
//     orderBy: [{ verificationType: { slug: "asc" } }, { frequency: "asc" }],
//   });
//   const codeByDescription = new Map(
//     (await listAllPaystackPlans()).map((plan) => [plan.description, plan.plan_code]),
//   );
//
//   for (const verificationPlan of verificationPlans) {
//     const label = `${verificationPlan.verificationType.slug}/${verificationPlan.frequency}`;
//     const interval = intervalByFrequency[verificationPlan.frequency];
//     if (!interval) {
//       logger.info(`Skipping ${label}: Paystack subscriptions are recurring only`);
//       continue;
//     }
//
//     const marker = `verification_plan_id=${verificationPlan.id}`;
//     let planCode = codeByDescription.get(marker);
//     if (planCode) {
//       logger.info(`Paystack plan ${planCode} already exists for ${label}`);
//     } else {
//       planCode = (
//         await createPaystackPlan({
//           name: `${verificationPlan.verificationType.name} - ${verificationPlan.name}`,
//           amount: verificationPlan.priceInCents,
//           interval,
//           currency: verificationPlan.currency,
//           description: marker,
//         })
//       ).plan_code;
//       logger.info(`Created Paystack plan ${planCode} for ${label}`);
//     }
//
//     if (verificationPlan.paystackPlanCode !== planCode) {
//       await prismaClient.verificationPlan.update({
//         where: { id: verificationPlan.id },
//         data: { paystackPlanCode: planCode },
//       });
//     }
//   }
// }
//
// setupPaystackPlans()
//   .catch((error) => {
//     logger.error(`Paystack plan setup failed: ${error}`);
//     process.exitCode = 1;
//   })
//   .finally(async () => {
//     await prismaClient.$disconnect();
//   });
export {};
