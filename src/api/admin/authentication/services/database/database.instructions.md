---
description: Admin authentication database service rules
applyTo: "src/api/admin/authentication/services/database/**/*.ts"
---

Follow the nearest `database.md`.

- Use typed Prisma CRUD functions.
- Keep authentication and authorization decisions outside the database service.
- Log safe IDs and counts, never passwords or token hashes.
- Rethrow Prisma failures after logging.
