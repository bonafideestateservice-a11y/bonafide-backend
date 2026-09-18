---
description: Shared TypeScript type rules
applyTo: "src/types/**/*.ts"
---

Follow `src/types/types.md`.

- Put only genuinely shared types here.
- Reuse generated Prisma types for database models.
- Keep request types aligned with runtime validation.
- Do not use `any` to bypass a missing type.
