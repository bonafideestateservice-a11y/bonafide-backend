# Jobs Guide

The `src/jobs` folder is the home for scheduled or background application jobs.

## Structure

```text
src/jobs/
├── index.ts                  # initJobs / closeJobs
├── queues.ts                 # QueueName enum
└── notifications/
    ├── queue.ts              # enqueue helpers used by event listeners
    ├── event-handlers.ts     # per-event recipient selection and message content
    ├── processors.ts         # event and delivery job processors
    ├── worker.ts             # starts the notification workers
    └── types.ts              # delivery job data
```

`initJobs` is the startup entry point for registering scheduled work. Keep job setup separate from route handlers and application bootstrap details. Queue and worker plumbing lives in `src/libs/bullmq`, and the Redis connection in `src/libs/redis`.

## Running Workers

Workers need `REDIS_URL`. Without it, `initJobs` logs a warning and starts nothing, and emitted events fail to queue (the failure is logged).

- By default the API process runs the workers (`RUN_WORKERS=true`).
- To run them separately, set `RUN_WORKERS=false` on the API and start `npm run worker` (or `npm run dev:worker`).
- Both processes close workers and queues on `SIGINT`/`SIGTERM`, letting in-flight jobs finish.

Tests set `REDIS_URL=""` in `src/tests/setup.ts`, so they never touch a real queue.

## Notification Pipeline

1. A listener adds the emitted event to `notification-events`, with the event type as the job name.
2. `processNotificationEvent` runs the handler in `event-handlers.ts`, which returns one delivery per recipient per channel (`email`, `in_app`), then adds them to `notification-deliveries` in one batch.
3. `processNotificationDelivery` sends one delivery. Tracked deliveries check `NotificationSettings`, create a `PENDING` `Notification` row, and mark it `SENT` or `FAILED`.

Retries are safe:

- Delivery job ids are `<eventJobId>-<userId>-<channel>`, so retrying the event job does not queue duplicates.
- A delivery stores its `notificationId` on the job, so retries reuse that row, and a row already marked `SENT` is never re-sent.
- A missing email template key fails the job permanently (`UnrecoverableError`) instead of retrying.

Jobs retry `BULLMQ_JOB_ATTEMPTS` times (default 5) with exponential backoff from 5 seconds. Jobs carrying an OTP (`FORGOT_PASSWORD`) are removed from Redis as soon as they finish, and job data is never logged.

## Email Templates

Templates are defined in `src/libs/zeptomail/templates.ts`. Each key is read from `ZEPTO_TEMPLATE_<TEMPLATE>`; the three templates that already exist in ZeptoMail fall back to their current keys. All merge values are strings, and missing optional data is sent as `""`.

Verification request fields (`requestFields` below): `firstName`, `verificationRequestId`, `verificationType`, `serviceName`, `requestName` (property or business name), `address` (property, construction or business address).
Client fields (`clientFields`): `clientName`, `clientEmail`, `clientPhone`.

| Template                             | Sent to        | Merge fields                                                                                                                     |
| ------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `USER_REGISTERED`                    | New user       | `firstName`, `email`                                                                                                             |
| `FORGOT_PASSWORD`                    | Initiator      | `firstName`, `otp`, `resetLink` (same as `otp`), `expiresIn`                                                                     |
| `PAYMENT_RECEIVED`                   | Payer          | `firstName`, `amount` (e.g. `1,500.00`), `currency`, `reference`, `payment_receipt`, `receipt_id`, `booking_ref`, `service_name` |
| `PAYMENT_RECEIVED_ADMIN`             | Admins         | Same as `PAYMENT_RECEIVED` + `clientName`, `clientEmail`                                                                         |
| `VERIFICATION_REQUEST_CREATED`       | Client         | requestFields + `submittedAt`                                                                                                    |
| `VERIFICATION_REQUEST_CREATED_ADMIN` | Admins         | requestFields + clientFields + `submittedAt`                                                                                     |
| `REPORT_UPLOADED`                    | Client         | requestFields + `reportId`, `agentName`                                                                                          |
| `REPORT_UPLOADED_ADMIN`              | Admins         | requestFields + clientFields + `reportId`, `agentName`                                                                           |
| `AGENT_ASSIGNED`                     | Client         | requestFields + `agentName`, `agentPhone`                                                                                        |
| `AGENT_ASSIGNED_AGENT`               | Assigned agent | requestFields + clientFields + `assignmentId`                                                                                    |
| `INSPECTION_STARTED`                 | Client         | requestFields + `agentName`                                                                                                      |
| `INSPECTION_STARTED_ADMIN`           | Admins         | requestFields + clientFields + `assignmentId`, `agentName`                                                                       |

In every template, `firstName` is the recipient's name.

## Rules

- Add each job as a focused function with a clear responsibility.
- Register jobs from `initJobs` rather than starting timers during module import.
- Make repeated execution safe and idempotent where possible.
- Log job start, completion, and failure with enough context to diagnose a run.
- Keep database access in database services and provider calls in `src/libs`.
- Do not block request handling with long-running job work.
- Add tests for job logic and failure handling without waiting on real time-based schedulers.
