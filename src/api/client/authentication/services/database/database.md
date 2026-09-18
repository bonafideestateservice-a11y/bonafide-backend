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
