# Jobs Guide

The `src/jobs` folder is the home for scheduled or background application jobs.

## Structure

```text
src/jobs/
└── index.ts
```

`initJobs` is the startup entry point for registering scheduled work. Keep job setup separate from route handlers and application bootstrap details.

## Rules

- Add each job as a focused function with a clear responsibility.
- Register jobs from `initJobs` rather than starting timers during module import.
- Make repeated execution safe and idempotent where possible.
- Log job start, completion, and failure with enough context to diagnose a run.
- Keep database access in database services and provider calls in `src/libs`.
- Do not block request handling with long-running job work.
- Add tests for job logic and failure handling without waiting on real time-based schedulers.
