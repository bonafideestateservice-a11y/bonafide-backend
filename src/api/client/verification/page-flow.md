Verification Flow — Pages & Endpoints
HomePage
GET /verification-requests
GET /verification-requests/reports-summary
Verification — Select Category
GET /services/verification/verification-types
Enter Property Details
POST /verification-requests
POST /verification-requests/:id/documents
Choose Frequency
GET /verification-types/:slug/plans
PATCH /verification-requests/:id/plan
Make Payment (summary)
GET /verification-requests/:id
Pay with Card
POST /verification-requests/:id/payments
POST /payments/webhook
Payment Successful
GET /verification-requests/:id
GET /verification-requests/:id/receipt
