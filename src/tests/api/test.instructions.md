---
description: API endpoint test structure and execution rules
applyTo: "src/tests/api/**/*.ts"
---

Follow `src/tests/api/test.md`.

- Give each endpoint its own test directory.
- Add unit and integration coverage for endpoint behavior.
- Mock database services in unit tests; use real Prisma in integration tests.
- Seed and clean up integration data.
- Record final results in the endpoint result documentation when required.
