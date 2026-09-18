---
description: Application exception rules
applyTo: "src/exceptions/**/*.ts"
---

Follow `src/exceptions/exceptions.md`.

- Reuse `ApiError` and existing specialized exception classes.
- Use `HttpStatusCode` instead of numeric status literals.
- Keep client messages safe and free of internal details.
- Let the error middleware format responses.
