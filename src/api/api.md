# API Development Guide

This document is the guide for creating and changing HTTP endpoints under `src/api`. Follow the existing module boundaries and keep endpoint behavior easy to test.

## Runtime Structure

The application mounts `src/routes.ts` under `/api` in `src/app.ts`:

```text
/api
├── /:version/client
│   ├── authentication
│   └── verification
├── /:version/admin
│   └── authentication
└── /:version/webhook
    └── webhooks
```

The current endpoint groups are:

```text
src/api/
├── admin/
│   ├── authentication/
│   └── verification/
├── client/
│   ├── authentication/
│   └── verification/
├── services/
│   └── database/
└── webhooks/
    ├── handlers/
    └── services/database/
```

`src/routes.ts` is the composition point. Add a new top-level API group there only when it needs a new URL namespace. Add endpoints to the owning domain router instead of placing route logic in `routes.ts`.

## Endpoint Module Structure

Use this structure for a new endpoint group:

```text
src/api/[audience]/[domain]/
├── index.ts
├── handlers/
│   ├── index.ts
│   └── [endpoint-name]/
│       ├── index.ts
│       └── [endpoint-name]-v1.ts
└── services/
    └── database/
        └── [resource].ts
```

Existing authentication modules use one endpoint folder per handler. Preserve that layout and use the versioned handler filename when the endpoint is version-specific.

## Request Flow

1. The domain `index.ts` creates an Express router.
2. The router imports handlers and any required middleware.
3. Authentication and authorization middleware are placed before protected handlers.
4. The handler validates input, calls a database service or shared library, and sends the success response.
5. Expected failures are passed to `next` as `ApiError` or one of its specialized subclasses.
6. Unexpected failures are logged and converted to an internal server error.
7. The router is exported and mounted by `src/routes.ts`.

Handlers should not contain direct Prisma queries. Put persistence operations in the nearest `services/database` module and keep external provider calls behind `src/libs`.

## Routing Rules

- Keep route registration in the owning domain router.
- Use `checkJwt` for authenticated routes.
- Use `checkRoles` for role-restricted routes, after JWT authentication.
- Use the existing `CustomRequest` type when reading `req.token` or `req.user`.
- Keep URL and response naming consistent with neighboring endpoints.
- Do not duplicate the `/api` prefix in a domain router; it is mounted by the application.
- Confirm the actual mounted URL from `src/routes.ts` when adding Swagger documentation.

## Swagger Documentation

Every public endpoint must have an `@swagger` block beside its route registration. Include:

- The mounted path and HTTP method.
- Tags, summary, security requirements, and version parameter where applicable.
- Request body or query/path parameters.
- Success and expected error responses.
- Existing component schema references from `src/utils/swagger.ts` where possible.

Update `src/utils/swagger.ts` when an endpoint introduces a reusable request or response schema.

## Handler and Service Rules

- Validate required fields and types before database work.
- Normalize values using the existing conventions, such as trimming and lowercasing emails.
- Use `HttpStatusCode` and the existing exception classes.
- Never return password hashes, reset-token hashes, or other secrets.
- Use `logger` for meaningful warnings, errors, and security-sensitive events.
- Keep database services focused on Prisma operations and return data needed by handlers.
- Keep provider integrations in `src/libs` and make them replaceable.
- Match the existing response shape: successful responses commonly include `status`, `message`, `data`, `token`, or `user` as appropriate.

## Endpoint Workflow

When creating or changing an endpoint:

1. Identify the owning audience and domain router.
2. Add or update the handler, handler index, and database service as needed.
3. Register middleware and the route in the owning `index.ts`.
4. Add the Swagger definition and reusable schemas if needed.
5. Add unit, integration, and load coverage in `src/tests/api` using the testing guide at `src/tests/api/test.md`.
6. Run the focused unit test, then the integration test with `--runInBand`.
7. Run the TypeScript build and review the generated API behavior before considering the change complete.

Do not create nested guide files for individual API modules unless a future module has rules that cannot be represented here.

POST /payments/webhook   (gateway → your server, not client-facing)
→ 200
  // on success: Payment.status=SUCCESS, Payment.paidAt=now, VerificationRequest.status=SUBMITTED
  // on failure: Payment.status=FAILED, VerificationRequest.status=PAYMENT_FAILED
