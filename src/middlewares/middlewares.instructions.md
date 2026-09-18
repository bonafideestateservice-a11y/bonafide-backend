---
description: Express middleware rules
applyTo: "src/middlewares/**/*.ts"
---

Follow `src/middlewares/middlewares.md`.

- Call `next()` exactly once on success or `next(error)` on failure.
- Preserve authentication-before-authorization order.
- Use `CustomRequest` for attached user and token data.
- Keep response formatting centralized in the error middleware.
