---
description: Admin verification database service rules
applyTo: "src/api/admin/verification/services/database/**/*.ts"
---

Follow the nearest `database.md`.

- Use generated Prisma types and explicit CRUD contracts.
- Scope queries with relation filters when required.
- Keep HTTP and authorization logic in handlers or middleware.
- Log safe identifiers and rethrow database errors.
