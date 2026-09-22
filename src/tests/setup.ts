jest.mock("@paystack/paystack-sdk", () => ({
  Paystack: class {},
}));
