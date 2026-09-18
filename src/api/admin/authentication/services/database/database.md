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
