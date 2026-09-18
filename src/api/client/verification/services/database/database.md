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
