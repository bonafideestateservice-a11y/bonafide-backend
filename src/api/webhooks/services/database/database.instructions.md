---
description: Webhook database service rules
applyTo: "src/api/webhooks/services/database/**/*.ts"
---

Follow the nearest `database.md`.

- Make webhook writes idempotent.
- Use unique provider event IDs or references where available.
- Keep signature validation and event routing outside database services.
- Log safe event identifiers and rethrow database failures.
