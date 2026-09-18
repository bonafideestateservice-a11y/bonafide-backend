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
