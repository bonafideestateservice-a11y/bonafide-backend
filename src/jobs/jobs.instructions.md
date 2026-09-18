---
description: Background job implementation rules
applyTo: "src/jobs/**/*.ts"
---

Follow `src/jobs/jobs.md`.

- Register jobs through `initJobs`.
- Keep jobs idempotent where possible.
- Log start, completion, and failure.
- Keep database and provider access behind their service boundaries.
