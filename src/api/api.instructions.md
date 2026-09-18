---
description: API endpoint architecture and implementation rules
applyTo: "src/api/**/*.ts"
---

Follow `src/api/api.md`.

- Keep routes in the owning domain router.
- Add Swagger documentation beside every public endpoint.
- Put Prisma access in the nearest database service.
- Use existing middleware, exception classes, logger, and response conventions.
- Add focused unit and integration tests for new endpoints.
