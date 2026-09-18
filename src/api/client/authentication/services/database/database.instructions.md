---
description: Client authentication database service rules
applyTo: "src/api/client/authentication/services/database/**/*.ts"
---

Follow the nearest `database.md`.

- Define typed create, update, and unique lookup contracts.
- Normalize identity values before service calls.
- Keep password hashing, JWT creation, and response sanitization outside the service.
- Use explicit ordering for collection queries and rethrow logged failures.
