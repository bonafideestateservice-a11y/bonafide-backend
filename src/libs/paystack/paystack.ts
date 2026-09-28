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
  const response = await axios.request<PaystackResponse<T>>(config);

  if (!response.data.status) {
    throw new Error(response.data.message || "Paystack request failed");
  }

  return response.data.data;
}

export async function createPaystackSession(params: CreateTransactionParams) {
  if (!params.email || !params.amount || !params.customer) {
    throw new Error("Please provide a valid customer email, amount to charge, and customer");
  }

  const callback_url = `${process.env.SERVER_URL}/account.html`;
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
    callback_url,
    currency: params.currency,
    metadata,
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

export async function listPaystackPlans() {
  return paystackRequest("GET", "/plan");
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
