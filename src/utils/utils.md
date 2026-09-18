# Utilities Guide

The `src/utils` folder contains small, reusable infrastructure helpers shared by API modules, middleware, services, and jobs.

## Structure

```text
src/utils/
├── date.ts
├── jwt.ts
├── logger.ts
├── otp.ts
├── password.ts
├── prisma.ts
├── swagger.ts
└── validations.ts
```

## Rules

- Keep utilities framework-light and focused on one reusable concern.
- Do not put endpoint-specific business workflows in this folder.
- Keep security-sensitive helpers centralized: JWT handling, password hashing, OTP generation, and Prisma access should use the existing modules.
- Never log secrets or return password/token hashes to callers.
- Prefer typed inputs and outputs and preserve existing public exports.
- Use Zod or the existing validation helpers for reusable input schemas.
- Add unit tests for deterministic behavior and mock time, randomness, Prisma, or environment configuration when needed.
- Update `swagger.ts` for reusable OpenAPI schemas, not inside unrelated utility modules.

When a helper is only used by one domain, keep it in that domain until there is a real reuse case.
