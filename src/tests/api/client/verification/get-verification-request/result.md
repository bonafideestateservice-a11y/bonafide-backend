# Get Verification Request Test Result

Added `GET /api/v1/client/verification-requests/:id` for the payment summary screen.

- Unit: 4 tests passed.
- Integration: 3 tests passed with `--runInBand`.
- TypeScript: `npx tsc --noEmit` passed.

The endpoint reads the authenticated user's request, verification type name, details, and selected plan fields. Requests owned by another user are returned as not found, and requests without a selected plan cannot produce the summary response.
