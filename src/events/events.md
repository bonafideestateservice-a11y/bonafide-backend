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

| Event                          | Payload                                                   | Emission point                                                               | Endpoint or workflow                                                                            |
| ------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `USER_REGISTERED`              | `{ userId, email }`                                       | No current emitter; listener is registered                                   | Add to the successful signup flow when registration side effects are required                   |
| `USER_LOGIN`                   | Not defined                                               | No current emitter or listener                                               | Add to the successful client/admin login flows when needed                                      |
| `PAYMENT_RECEIVED`             | `{ amount, reference }`                                   | No current emitter; listener is registered                                   | Payment webhook flows should emit this after a successful Paystack or Stripe transaction update |
| `FORGOT_PASSWORD`              | Defined by the forgot-password handlers                   | Client and admin forgot-password handlers                                    | Client/admin forgot-password endpoints                                                          |
| `VERIFICATION_REQUEST_CREATED` | `{ verificationRequestId, userId }`                       | `createVerificationRequest` after `VerificationRequest.create` succeeds      | Client `POST /verification-requests`                                                            |
| `REPORT_UPLOADED`              | `{ reportId, verificationRequestId, submittedByAgentId }` | `createVerificationReport` after `VerificationReport.create` succeeds        | Any workflow using the client verification-report database service                              |
| `AGENT_ASSIGNED`               | `{ assignmentId, verificationRequestId, agentId }`        | `createAgentAssignment` after `AgentAssignment.create` succeeds              | Any workflow that assigns an agent to a verification request                                    |
| `INSPECTION_STARTED`           | `{ assignmentId, verificationRequestId, agentId }`        | `startAgentAssignment` after an `ASSIGNED` to `ACCEPTED` transaction commits | Admin `POST /verification/agent-assignments/:id/start`                                          |

Listeners are registered in `listeners.ts`. Event names and payload interfaces are defined in `index.ts`.
