# Reminders

Work that has to wait for another feature. Pick these up when the feature they depend on is built.

## 1. "Properties Purchased" and "Total amount spent" on the User Profile page

**Wait for:** clients buying properties (not built yet).

**Endpoint:** `GET /api/v1/admin/users/:id` (admin User Management > View Profile for a client).

**What the screen shows:**

- "Properties Purchased on Bonafide": the number of properties the client has bought.
- "Total amount spent on Properties": how much they have paid for those properties.
- The "₦125k Spent" badge on the profile card, which shows the same total.

**What the endpoint returns today:**

- Nothing records property purchases yet, so the stats use verification payments instead:
  - `stats.paidRequests`: verification requests with at least one successful payment.
  - `stats.totalSpent`: the sum of successful `Transaction` payments on the client's verification requests, in naira.
- So the screen currently shows verification activity, not property purchases.

**To do once purchases exist:**

1. Choose the tables that hold purchases. Likely a new purchase/order table linking `userId` and `propertyId`, with the amount, currency, status and paid date. Or a `propertyId` on `Transaction` if purchases are paid through it.
2. Count only completed purchases (not pending, failed or refunded), and sum their amounts.
3. Decide whether to keep `paidRequests` and `totalSpent` for verifications as separate figures, or replace them.
4. Update the code:
   - The query: `getClientProfile` in `src/api/admin/dashboard/services/database/user.ts`.
   - The response: `src/api/admin/dashboard/handlers/get-user/get-user.v1.ts`.
   - The Swagger block for `/api/{version}/admin/users/{id}` in `src/api/admin/dashboard/index.ts`.
   - The tests in `src/tests/api/admin/dashboard/get-user/`.
5. Update section 8 of `docs/admin-dashboard-endpoint-plan.md`.
