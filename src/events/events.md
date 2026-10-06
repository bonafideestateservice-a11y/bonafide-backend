# Events Guide

The `src/events` folder provides the in-process event bus used to decouple application actions from listeners and side effects.

## Structure

```text
src/events/
├── index.ts
└── listeners.ts
```

`index.ts` defines `AppEventTypes`, creates the shared `appEvents` EventEmitter, and imports listeners so they are registered during startup. `listeners.ts` subscribes to events and performs the current side effects.

## Rules

- Add event names to `AppEventTypes`; do not scatter string literals through handlers.
- Keep event payloads typed at the listener boundary.
- Emit events after the primary operation has succeeded.
- Do not make handlers responsible for listener implementation details.
- Keep listeners small and delegate provider work to `src/libs` when needed.
- Log listener failures and avoid silently swallowing errors.
- Be aware that this is an in-process bus: events are not durable and are lost if the process stops.

When adding an event, update the enum, emit it from the owning application flow, register its listener, and add focused tests for the emitter/listener behavior.

## Application Event Catalog

| Event                          | Payload                                                                                                              | Emission point                                                               | Endpoint or workflow                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `USER_REGISTERED`              | `{ userId, email, firstName }`                                                                                       | `signUp` after `Client.create` succeeds                                      | Client `POST /signup`                                                          |
| `USER_LOGIN`                   | Not defined                                                                                                          | No current emitter or listener                                               | Add to the successful client/admin login flows when needed                     |
| `PAYMENT_RECEIVED`             | `{ userId, email, firstName, amount, reference, payment_receipt, booking_ref, receipt_id, currency, service_name? }` | Paystack `charge.success` and Stripe successful payment updates              | Payment receipt email after a successful Paystack or Stripe transaction update |
| `FORGOT_PASSWORD`              | Defined by the forgot-password handlers                                                                              | Client and admin forgot-password handlers                                    | Client/admin forgot-password endpoints                                         |
| `VERIFICATION_REQUEST_CREATED` | `{ verificationRequestId, userId }`                                                                                  | `createVerificationRequest` after `VerificationRequest.create` succeeds      | Client `POST /verification-requests`                                           |
| `REPORT_UPLOADED`              | `{ reportId, verificationRequestId, submittedByAgentId }`                                                            | `createVerificationReport` after `VerificationReport.create` succeeds        | Any workflow using the client verification-report database service             |
| `AGENT_ASSIGNED`               | `{ assignmentId, verificationRequestId, agentId }`                                                                   | `createAgentAssignment` after `AgentAssignment.create` succeeds              | Any workflow that assigns an agent to a verification request                   |
| `INSPECTION_STARTED`           | `{ assignmentId, verificationRequestId, agentId }`                                                                   | `startAgentAssignment` after an `ASSIGNED` to `ACCEPTED` transaction commits | Admin `POST /verification/agent-assignments/:id/start`                         |

## Notification Delivery

Listeners in `listeners.ts` only add the event to the `notification-events` BullMQ queue, so endpoints never wait on email or push delivery. The workers in `src/jobs/notifications` choose the recipients and send each message; see `src/jobs/jobs.md` for the pipeline and the email templates.

| Event                          | Recipients                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `USER_REGISTERED`              | The registered user (`userId`/`email` from the payload)                                            |
| `PAYMENT_RECEIVED`             | The paying user and all `ADMIN` users                                                              |
| `FORGOT_PASSWORD`              | The user who initiated the reset (`userId`/`email` from the payload)                               |
| `VERIFICATION_REQUEST_CREATED` | The user who submitted the request and all `ADMIN` users                                           |
| `REPORT_UPLOADED`              | The user who submitted the request (unless `notifyOnReportReady` is off) and all `ADMIN` users     |
| `AGENT_ASSIGNED`               | The user who submitted the request and the assigned agent                                          |
| `INSPECTION_STARTED`           | The user who submitted the request (unless `notifyOnInspectionStart` is off) and all `ADMIN` users |

`USER_REGISTERED` and `FORGOT_PASSWORD` are transactional emails: always sent, never recorded. Every other delivery respects the recipient's `NotificationSettings` and is recorded in the `Notification` table. An admin who is also the requesting user is notified once.

Event names, payload interfaces and the `AppEventPayloads` map are defined in `index.ts`.
