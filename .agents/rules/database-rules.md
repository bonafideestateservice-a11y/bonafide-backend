# DATABASE RULES

## Source: src/api/admin/authentication/services/database/database.instructions.md

---
description: Admin authentication database service rules
applyTo: "src/api/admin/authentication/services/database/**/*.ts"
---

Follow the nearest `database.md`.

- Use typed Prisma CRUD functions.
- Keep authentication and authorization decisions outside the database service.
- Log safe IDs and counts, never passwords or token hashes.
- Rethrow Prisma failures after logging.


## Source: src/api/admin/authentication/services/database/database.md

# Database Service Guide

Database services in this folder own Prisma access for admin authentication. Keep handlers focused on HTTP validation and responses; keep queries and persistence here.

## Service Pattern

- Import the Prisma model type and `Prisma` input types from `@prisma/client`.
- Import the shared `prismaClient` from `src/utils/prisma` and `logger` from `src/utils/logger`.
- Define typed `Create...Data`, `Update...Data`, and `Find...Unique` interfaces before service functions.
- Return Prisma model types or `null` for lookups.
- Use `findUnique` for unique identifiers, `findMany` with an explicit order for lists, and `update`/`delete` with `WhereUniqueInput`.
- Log successful operations with the relevant record ID and log failures before rethrowing.

## CRUD Workflow

1. Confirm the operation and ownership rules in the handler.
2. Add the smallest typed service function needed.
3. Do not expose passwords or token hashes through API responses.
4. Let Prisma enforce relations and uniqueness; translate errors at the handler boundary when needed.
5. Unit-test services through mocked Prisma where service behavior is important, and integration-test critical persistence through the API.


## Source: src/api/admin/verification/services/database/database.instructions.md

---
description: Admin verification database service rules
applyTo: "src/api/admin/verification/services/database/**/*.ts"
---

Follow the nearest `database.md`.

- Use generated Prisma types and explicit CRUD contracts.
- Scope queries with relation filters when required.
- Keep HTTP and authorization logic in handlers or middleware.
- Log safe identifiers and rethrow database errors.


## Source: src/api/admin/verification/services/database/database.md

# Database Service Guide

Database services in this folder provide admin verification data access. They should contain Prisma operations only, with authorization decisions kept in handlers or middleware.

## Conventions

- Use typed Prisma model and input types.
- Define explicit create, update, and unique lookup interfaces.
- Keep list queries ordered and select only fields required by the caller.
- Use relation filters for scoped data rather than fetching broad data and filtering in memory.
- Log record IDs and counts, but never log sensitive payloads or credentials.
- Catch, log, and rethrow database errors so handlers can return the standard internal error response.

New functions should follow the existing `create...`, `getAll...`, `find...`, `update...`, and `delete...` naming pattern.


## Source: src/api/client/authentication/services/database/database.instructions.md

---
description: Client authentication database service rules
applyTo: "src/api/client/authentication/services/database/**/*.ts"
---

Follow the nearest `database.md`.

- Define typed create, update, and unique lookup contracts.
- Normalize identity values before service calls.
- Keep password hashing, JWT creation, and response sanitization outside the service.
- Use explicit ordering for collection queries and rethrow logged failures.


## Source: src/api/client/authentication/services/database/database.md

# Database Service Guide

Database services in this folder own Prisma access for client authentication. Handlers validate requests and call these functions instead of querying Prisma directly.

## Required Pattern

- Define typed create and update data interfaces.
- Define a unique lookup interface and convert it to `Prisma.*WhereUniqueInput`.
- Normalize identity values such as email before calling the service.
- Return Prisma model types, `null` for missing records, or a typed collection.
- Order list results explicitly, usually by `createdAt` descending.
- Log successful operations and rethrow database failures after logging.
- Keep password hashing, JWT creation, and response sanitization outside the database service.

CRUD functions should be small, reusable, and straightforward to mock in handler unit tests.


## Source: src/api/client/verification/services/database/database.instructions.md

---
description: Client verification database service rules
applyTo: "src/api/client/verification/services/database/**/*.ts"
---

Follow the nearest `database.md`.

- Scope user-owned reads with relation filters.
- Use typed Prisma CRUD functions and selective projections.
- Persist document metadata only; keep storage/provider logic elsewhere.
- Log safe IDs and counts, and rethrow Prisma failures.


## Source: src/api/client/verification/services/database/database.md

# Database Service Guide

Database services in this folder own Prisma access for client verification. Handlers handle HTTP concerns, authentication, validation, and response mapping; these services handle persistence and relation queries.

## Conventions

- Use generated Prisma types and `Prisma.*` input types.
- Define `Create...Data`, `Update...Data`, and unique lookup interfaces.
- Scope user-owned reads with relation filters such as `verificationRequest: { userId }`.
- Use `select` when a handler needs a summary instead of returning an entire model.
- Order list results explicitly and use stable limits where the API specifies them.
- Log IDs and counts, not document contents, tokens, or other sensitive values.
- Catch, log, and rethrow Prisma errors; handlers translate them to `ApiError` responses.
- Keep file storage/provider behavior outside Prisma services; persist only document metadata here.

For CRUD resources, follow the `create...`, `getAll...`, `find...`, `update...`, and `delete...` pattern.


## Source: src/api/services/database/database.instructions.md

---
description: Shared database service rules
applyTo: "src/api/services/database/**/*.ts"
---

Follow the nearest `database.md`.

- Use the shared Prisma client and generated model types.
- Define typed data contracts before exported functions.
- Follow `create`, `getAll`, `find`, `update`, and `delete` naming.
- Avoid duplicate implementations; domain folders should re-export shared services when appropriate.
- Log and rethrow database failures.


## Source: src/api/services/database/database.md

# Database Service Guide

This folder contains shared database services used across API domains. Use it for resources with cross-domain persistence behavior, such as password reset tokens and document metadata.

## Service Pattern

- Import generated Prisma model types and `Prisma` input types.
- Use the singleton `prismaClient` from `src/utils/prisma`.
- Define typed data contracts before exported functions.
- Use descriptive CRUD names: `create...`, `getAll...`, `find...`, `update...`, and `delete...`.
- Accept `Prisma.*WhereUniqueInput` for update/delete operations when callers already have a unique selector.
- Log successful IDs/counts and log errors before rethrowing.
- Keep business authorization and HTTP response formatting in handlers.
- Avoid duplicate implementations: domain-specific database modules should re-export a shared service when the same model is used in multiple domains.


## Source: src/api/webhooks/services/database/database.instructions.md

---
description: Webhook database service rules
applyTo: "src/api/webhooks/services/database/**/*.ts"
---

Follow the nearest `database.md`.

- Make webhook writes idempotent.
- Use unique provider event IDs or references where available.
- Keep signature validation and event routing outside database services.
- Log safe event identifiers and rethrow database failures.


## Source: src/api/webhooks/services/database/database.md

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


