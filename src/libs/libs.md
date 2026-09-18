# Libraries Guide

The `src/libs` folder contains adapters for external providers and integrations. These modules keep vendor-specific behavior away from handlers, services, and jobs.

## Structure

```text
src/libs/
├── email/index.ts
├── payments/index.ts
├── push/index.ts
└── sms/index.ts
```

## Rules

- Expose small, domain-oriented functions such as `sendEmail` or `createPayment`.
- Keep provider-specific configuration and response translation inside the relevant library.
- Use explicit input and output types for integration boundaries.
- Never log secrets, authorization headers, passwords, OTPs, or full payment credentials.
- Return stable application-facing results rather than leaking vendor response shapes.
- Throw or return failures consistently so callers can handle them deliberately.
- Mock library modules in unit tests; use an approved sandbox or test double for integration tests.
- Add a new provider under the relevant category instead of placing provider code in API handlers.
