export type PaystackPaymentMethod = "CARD" | "BANK_TRANSFER";

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
