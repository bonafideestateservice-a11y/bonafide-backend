export type PaystackPaymentMethod = "CARD" | "BANK_TRANSFER";

export interface PaymentMetadata {
  userId: string;
  verificationRequestId: string;
  transactionId: string;
  description: string;
}

export interface CreateTransactionParams {
  userId: string;
  email: string;
  amount: number;
  customer: string;
  plan?: string;
  currency: string;
  paymentMethod: PaystackPaymentMethod;
  verificationRequestId: string;
  transactionId: string;
}
