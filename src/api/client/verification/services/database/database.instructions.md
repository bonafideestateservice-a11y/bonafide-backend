---
description: Client verification database service rules
applyTo: "src/api/client/verification/services/database/**/*.ts"
---

Follow the nearest `database.md`.

- Scope user-owned reads with relation filters.
- Use typed Prisma CRUD functions and selective projections.
- Persist document metadata only; keep storage/provider logic elsewhere.
- Log safe IDs and counts, and rethrow Prisma failures.
