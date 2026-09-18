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
