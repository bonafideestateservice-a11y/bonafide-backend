---
description: Shared utility implementation rules
applyTo: "src/utils/**/*.ts"
---

Follow `src/utils/utils.md`.

- Keep utilities focused and reusable.
- Centralize JWT, password, OTP, Prisma, logging, and Swagger behavior in the existing helpers.
- Never expose or log secrets and hashes.
- Add unit tests for deterministic helper behavior.
