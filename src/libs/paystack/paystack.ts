import { Paystack } from "@paystack/paystack-sdk";
import { CreateTransactionParams } from "../../types/paystack";

const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY || "");

export async function createPaystackSession(params: CreateTransactionParams) {
  if (!params.email || !params.amount || !params.customer) {
    throw new Error("Please provide a valid customer email, amount to charge, and customer");
  }

  const callback_url = `${process.env.SERVER_URL}/account.html`;
  const description = `Paystack transaction by user ${params.userId}`;

  const response = await paystack.transaction.initialize({
    email: params.email,
    customer: params.customer,
    amount: params.amount,
    ...(params.plan ? { plan: params.plan } : {}),
    channels: ["card"],
    callback_url,
    currency: params.currency,
    metadata: {
      userId: params.userId,
      verificationRequestId: params.verificationRequestId,
      transactionId: params.transactionId,
      description,
    },
  });

  if (response.status === false) {
    throw new Error(response.message || "Failed to initialize Paystack transaction");
  }

  return response.data;
}

export async function verifyPaystackTransaction(reference: string) {
  const response = await paystack.transaction.verify(reference);

  if (response.status === false) {
    throw new Error(response.message || "Failed to verify Paystack transaction");
  }

  const { status, amount, metadata } = response.data;
  return { status, amount, metadata };
}

export async function createPaystackRefund(
  transactionId: string,
  amount?: number,
  currency?: string,
) {
  const response = await paystack.refund.create({
    transaction: transactionId,
    ...(amount ? { amount } : {}),
    ...(currency ? { currency } : {}),
  });

  if (response.status === false) {
    throw new Error(response.message || "Failed to create Paystack refund");
  }

  return response.data;
}

export async function retryPaystackRefund(
  refundId: number,
  bankDetails: { accountNumber: string; bankId: string; currency?: string },
) {
  const response = await paystack.refund.retryWithCustomerDetails(refundId, {
    refund_account_details: {
      currency: bankDetails.currency || "NGN",
      account_number: bankDetails.accountNumber,
      bank_id: bankDetails.bankId,
    },
  });

  if (response.status === false) {
    throw new Error(response.message || "Failed to retry Paystack refund");
  }

  return response.data;
}

export async function getPaystackBanks(country = "nigeria") {
  const response = await paystack.bank.list({ country });

  if (response.status === false) {
    throw new Error(response.message || "Failed to fetch Paystack banks");
  }

  return response.data;
}

export async function resolvePaystackAccount(accountNumber: string, bankCode: string) {
  const response = await paystack.bank.resolve({
    account_number: accountNumber,
    bank_code: bankCode,
  });

  if (response.status === false) {
    throw new Error(response.message || "Failed to resolve Paystack account");
  }

  return response.data;
}

export async function createPaystackCustomer(email: string) {
  const response = await paystack.customer.create({ email });

  if (response.status === false) {
    throw new Error(response.message || "Failed to create Paystack customer");
  }

  return response.data;
}

export async function listPaystackPlans() {
  const response = await paystack.plan.list({});

  if (response.status === false) {
    throw new Error(response.message || "Failed to fetch Paystack plans");
  }

  return response.data;
}

export async function listPaystackSubscriptions(customer: string) {
  const response = await paystack.subscription.list({ customer });

  if (response.status === false) {
    throw new Error(response.message || "Failed to fetch Paystack subscriptions");
  }

  return response.data.filter(
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
  const response = await paystack.subscription.create({
    customer,
    plan,
    authorization,
    start_date,
  });

  if (response.status === false) {
    throw new Error(response.message || "Failed to create Paystack subscription");
  }

  return response.data;
}

export async function cancelPaystackSubscription(code: string, token: string) {
  const response = await paystack.subscription.disable({ code, token });

  if (response.status === false) {
    throw new Error(response.message || "Failed to cancel Paystack subscription");
  }
}
