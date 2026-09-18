---
description: Repository test workflow rules
applyTo: "src/tests/**/*.ts"
---

Follow `src/tests/tests.md`.

- Organize tests by audience, domain, and endpoint.
- Unit tests mock external dependencies.
- Integration tests use the real database and Supertest.
- Clean up all records created by integration tests.
- Run integration tests with `--runInBand`.
