# Database Service Guide

Database services in this folder are reserved for persistence required by webhook processing. Keep webhook signature validation and event routing in handlers; keep Prisma reads and writes here.

## Conventions

- Define typed input contracts for provider payloads before persistence.
- Make webhook writes idempotent where the provider can retry delivery.
- Use unique provider references or event IDs to prevent duplicate records.
- Wrap Prisma operations in small functions with explicit return types.
- Log event IDs and safe status information, never secrets or raw authorization headers.
- Catch, log, and rethrow database errors so webhook handlers can choose the correct acknowledgment behavior.
- Add focused unit tests with mocked Prisma and integration tests for idempotency and relation constraints.
