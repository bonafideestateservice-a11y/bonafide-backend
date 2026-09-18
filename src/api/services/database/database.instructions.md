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
