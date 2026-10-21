import axios, { AxiosRequestConfig, Method } from "axios";
import { CreateTransactionParams, PaymentMetadata } from "../../types/paystack";

type PaystackResponse<T> = {
  status: boolean;
  message?: string;
  data: T;
};

type PaystackTransactionSession = {
  reference: string;
  authorization_url: string;
  access_code: string;
};

type PaystackCustomer = {
  customer_code: string;
};

async function paystackRequest<T>(
  method: Method,
  path: string,
  data?: Record<string, unknown>,
  params?: Record<string, unknown>,
): Promise<T> {
  const config: AxiosRequestConfig = {
    method,
    url: `https://api.paystack.co${path}`,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || ""}`,
      "Content-Type": "application/json",
    },
    ...(data ? { data } : {}),
    ...(params ? { params } : {}),
  };
  const response = await axios.request<PaystackResponse<T>>(config).catch((error) => {
    // Keep Paystack's own reason (e.g. "Invalid key") instead of Axios's "status code 401".
    if (!axios.isAxiosError(error) || !error.response) throw error;
    const reason = (error.response.data as { message?: string } | undefined)?.message;
    throw new Error(
      `Paystack ${method} ${path} failed (${error.response.status})${reason ? `: ${reason}` : ""}`,
    );
  });

  if (!response.data.status) {
    throw new Error(response.data.message || "Paystack request failed");
  }

  return response.data.data;
}

/**
 * The amount (in the currency's minor unit) and currency Paystack charges for a plan.
 * The test Paystack account can't take USD, so with a test key and PAYSTACK_TEST_USD_TO_NGN_RATE
 * set, USD prices are charged in naira at that rate ($35 at 1600 = ₦56,000). Live keys always
 * charge the plan's own price and currency.
 */
export function paystackPriceOf(plan: { priceInCents: number; currency: string }) {
  const rate = Number(process.env.PAYSTACK_TEST_USD_TO_NGN_RATE);
  const isTestKey = (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_test_");
  if (isTestKey && rate > 0 && plan.currency === "USD") {
    return { amount: Math.round(plan.priceInCents * rate), currency: "NGN" };
  }
  return { amount: plan.priceInCents, currency: plan.currency };
}

/**
 * After paying, Paystack sends the user back to the frontend (CLIENT_URL), like Stripe does.
 * Without it, Paystack falls back to the callback URL set in its dashboard.
 */
const callbackUrl = () => (process.env.CLIENT_URL ? { callback_url: process.env.CLIENT_URL } : {});

export async function createPaystackSession(params: CreateTransactionParams) {
  if (!params.email || !params.amount || !params.customer) {
    throw new Error("Please provide a valid customer email, amount to charge, and customer");
  }

  const description = `Paystack transaction by user ${params.userId}`;

  const metadata: PaymentMetadata = {
    userId: params.userId,
    verificationRequestId: params.verificationRequestId,
    transactionId: params.transactionId,
    description,
  };

  return paystackRequest<PaystackTransactionSession>("POST", "/transaction/initialize", {
    email: params.email,
    customer: params.customer,
    amount: params.amount,
    ...(params.plan ? { plan: params.plan } : {}),
    channels: ["card"],
    ...callbackUrl(),
    currency: params.currency,
    metadata,
  });
}

/**
 * A one-off Paystack checkout (no plan, no customer record), e.g. a property payment.
 * `channels` limits the checkout to card or bank transfer.
 */
export async function createPaystackCheckout(params: {
  email: string;
  amount: number;
  currency: string;
  channels: Array<"card" | "bank_transfer">;
  metadata: Record<string, unknown>;
}) {
  return paystackRequest<PaystackTransactionSession>("POST", "/transaction/initialize", {
    ...params,
    ...callbackUrl(),
  });
}

export async function verifyPaystackTransaction(reference: string) {
  const data = await paystackRequest<{
    status: string;
    amount: number;
    metadata: PaymentMetadata;
  }>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
  const { status, amount, metadata } = data;
  return { status, amount, metadata };
}

export async function createPaystackRefund(
  transactionId: string,
  amount?: number,
  currency?: string,
) {
  return paystackRequest("POST", "/refund", {
    transaction: transactionId,
    ...(amount ? { amount } : {}),
    ...(currency ? { currency } : {}),
  });
}

export async function retryPaystackRefund(
  refundId: number,
  bankDetails: { accountNumber: string; bankId: string; currency?: string },
) {
  return paystackRequest("POST", "/refund/retry_with_customer_details", {
    refund: refundId,
    refund_account_details: {
      currency: bankDetails.currency || "NGN",
      account_number: bankDetails.accountNumber,
      bank_id: bankDetails.bankId,
    },
  });
}

export async function getPaystackBanks(country = "nigeria") {
  return paystackRequest("GET", "/bank", undefined, { country });
}

export async function resolvePaystackAccount(accountNumber: string, bankCode: string) {
  return paystackRequest("GET", "/bank/resolve", undefined, {
    account_number: accountNumber,
    bank_code: bankCode,
  });
}

export async function createPaystackCustomer(email: string) {
  return paystackRequest<PaystackCustomer>("POST", "/customer", { email });
}

export type PaystackPlan = { plan_code: string; description?: string | null };

export async function listPaystackPlans(page = 1, perPage = 100) {
  return paystackRequest<PaystackPlan[]>("GET", "/plan", undefined, { page, perPage });
}

export async function createPaystackPlan(plan: {
  name: string;
  amount: number;
  interval: string;
  currency: string;
  description: string;
}) {
  return paystackRequest<PaystackPlan>("POST", "/plan", {
    ...plan,
    send_invoices: false,
    send_sms: false,
  });
}

export async function listPaystackSubscriptions(customer: string) {
  const subscriptions = await paystackRequest<Array<{ status: string }>>(
    "GET",
    "/subscription",
    undefined,
    { customer },
  );

  return subscriptions.filter(
    (subscription: { status: string }) =>
      subscription.status === "active" || subscription.status === "non-renewing",
  );
}

export async function createPaystackSubscription(
  customer: string,
  plan: string,
  authorization?: string,
  start_date?: string,
) {
  return paystackRequest("POST", "/subscription", {
    customer,
    plan,
    authorization,
    start_date,
  });
}

export async function cancelPaystackSubscription(code: string, token: string) {
  await paystackRequest("POST", "/subscription/disable", { code, token });
}
