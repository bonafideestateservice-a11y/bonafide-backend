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
