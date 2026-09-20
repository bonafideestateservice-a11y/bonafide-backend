# MISC RULES

## Source: src/events/events.instructions.md

---
description: In-process event bus rules
applyTo: "src/events/**/*.ts"
---

Follow `src/events/events.md`.

- Add event names to `AppEventTypes`.
- Type listener payloads.
- Emit events after successful primary operations.
- Keep listeners small and delegate provider work to `src/libs`.


## Source: src/events/events.md

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


## Source: src/exceptions/exceptions.instructions.md

---
description: Application exception rules
applyTo: "src/exceptions/**/*.ts"
---

Follow `src/exceptions/exceptions.md`.

- Reuse `ApiError` and existing specialized exception classes.
- Use `HttpStatusCode` instead of numeric status literals.
- Keep client messages safe and free of internal details.
- Let the error middleware format responses.


## Source: src/exceptions/exceptions.md

# Exceptions Guide

The `src/exceptions` folder defines the application errors that cross the handler and Express middleware boundary.

## Structure

```text
src/exceptions/
└── index.ts
```

`ApiError` carries an `HttpStatusCode` and a client-safe message. Specialized errors such as `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, and `InternalServerError` provide consistent status mapping.

## Rules

- Use the existing exception class that matches the failure.
- Pass expected errors to `next(error)` from handlers and middleware.
- Do not expose database, provider, stack-trace, password, or token details in client messages.
- Add a new exception subclass only when it represents a stable, reusable HTTP category.
- Keep status codes in `HttpStatusCode`; do not introduce ad hoc numeric values.
- Let `src/middlewares/error-handler.ts` format the final response.

Unexpected errors should be logged and translated to `InternalServerError` or the existing generic internal-error behavior.


## Source: src/jobs/jobs.instructions.md

---
description: Background job implementation rules
applyTo: "src/jobs/**/*.ts"
---

Follow `src/jobs/jobs.md`.

- Register jobs through `initJobs`.
- Keep jobs idempotent where possible.
- Log start, completion, and failure.
- Keep database and provider access behind their service boundaries.


## Source: src/jobs/jobs.md

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


## Source: src/libs/libs.instructions.md

---
description: External integration adapter rules
applyTo: "src/libs/**/*.ts"
---

Follow `src/libs/libs.md`.

- Keep provider-specific behavior inside the relevant adapter.
- Use typed integration inputs and stable application-facing outputs.
- Never log secrets or credentials.
- Mock adapters in unit tests.


## Source: src/libs/libs.md

# Libraries Guide

The `src/libs` folder contains adapters for external providers and integrations. These modules keep vendor-specific behavior away from handlers, services, and jobs.

## Structure

```text
src/libs/
├── email/index.ts
├── payments/index.ts
├── push/index.ts
└── sms/index.ts
```

## Rules

- Expose small, domain-oriented functions such as `sendEmail` or `createPayment`.
- Keep provider-specific configuration and response translation inside the relevant library.
- Use explicit input and output types for integration boundaries.
- Never log secrets, authorization headers, passwords, OTPs, or full payment credentials.
- Return stable application-facing results rather than leaking vendor response shapes.
- Throw or return failures consistently so callers can handle them deliberately.
- Mock library modules in unit tests; use an approved sandbox or test double for integration tests.
- Add a new provider under the relevant category instead of placing provider code in API handlers.


## Source: src/middlewares/middlewares.instructions.md

---
description: Express middleware rules
applyTo: "src/middlewares/**/*.ts"
---

Follow `src/middlewares/middlewares.md`.

- Call `next()` exactly once on success or `next(error)` on failure.
- Preserve authentication-before-authorization order.
- Use `CustomRequest` for attached user and token data.
- Keep response formatting centralized in the error middleware.


## Source: src/middlewares/middlewares.md

# Middleware Guide

The `src/middlewares` folder contains reusable Express request, authentication, authorization, and error-processing middleware.

## Structure

```text
src/middlewares/
├── check-jwt.ts
├── check-roles.ts
└── error-handler.ts
```

## Request Flow

Application-level middleware is configured in `src/app.ts`. Domain routers apply route-specific middleware before handlers. Protected routes normally authenticate with `checkJwt` and then authorize with `checkRoles` when a role restriction is required.

## Rules

- Middleware must call `next()` exactly once on success or `next(error)` on failure.
- Keep middleware focused on request concerns; do not put endpoint business logic here.
- Use `CustomRequest` when attaching or reading `req.user` and `req.token`.
- Authentication failures use the existing unauthorized exceptions.
- Authorization failures use the existing forbidden exception.
- Preserve middleware order: authentication before authorization, and both before the handler.
- Do not query Prisma directly from a new middleware unless the middleware owns a cross-cutting authentication or authorization check.
- Test success, missing credentials, invalid credentials, and insufficient permissions.

The error middleware is the final formatter for known `ApiError` instances and unknown failures. Keep response formatting changes centralized there.


## Source: src/types/types.instructions.md

---
description: Shared TypeScript type rules
applyTo: "src/types/**/*.ts"
---

Follow `src/types/types.md`.

- Put only genuinely shared types here.
- Reuse generated Prisma types for database models.
- Keep request types aligned with runtime validation.
- Do not use `any` to bypass a missing type.


## Source: src/types/types.md

# Types Guide

The `src/types` folder contains shared TypeScript declarations and reusable request types.

## Structure

```text
src/types/
└── index.ts
```

The current module exports `AuthTokenPayload`, defines the Express `User` augmentation, and provides `TypedRequest<TBody>` for typed request bodies.

## Rules

- Put types here when they are shared across multiple source modules.
- Keep domain-specific types close to the domain unless they are genuinely reused.
- Prefer interfaces or type aliases that describe stable contracts clearly.
- Reuse generated Prisma types for database models instead of duplicating model shapes.
- Keep request-body types aligned with runtime validation.
- Do not use `any` to bypass a missing type; define the smallest useful type instead.
- Update all consumers when changing an exported shared type and run the TypeScript build.


## Source: src/utils/utils.instructions.md

---
description: Shared utility implementation rules
applyTo: "src/utils/**/*.ts"
---

Follow `src/utils/utils.md`.

- Keep utilities focused and reusable.
- Centralize JWT, password, OTP, Prisma, logging, and Swagger behavior in the existing helpers.
- Never expose or log secrets and hashes.
- Add unit tests for deterministic helper behavior.


## Source: src/utils/utils.md

# Utilities Guide

The `src/utils` folder contains small, reusable infrastructure helpers shared by API modules, middleware, services, and jobs.

## Structure

```text
src/utils/
├── date.ts
├── jwt.ts
├── logger.ts
├── otp.ts
├── password.ts
├── prisma.ts
├── swagger.ts
└── validations.ts
```

## Rules

- Keep utilities framework-light and focused on one reusable concern.
- Do not put endpoint-specific business workflows in this folder.
- Keep security-sensitive helpers centralized: JWT handling, password hashing, OTP generation, and Prisma access should use the existing modules.
- Never log secrets or return password/token hashes to callers.
- Prefer typed inputs and outputs and preserve existing public exports.
- Use Zod or the existing validation helpers for reusable input schemas.
- Add unit tests for deterministic behavior and mock time, randomness, Prisma, or environment configuration when needed.
- Update `swagger.ts` for reusable OpenAPI schemas, not inside unrelated utility modules.

When a helper is only used by one domain, keep it in that domain until there is a real reuse case.


