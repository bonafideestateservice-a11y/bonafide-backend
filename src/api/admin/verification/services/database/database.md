# Database Service Guide

Database services in this folder provide admin verification data access. They should contain Prisma operations only, with authorization decisions kept in handlers or middleware.

## Conventions

- Use typed Prisma model and input types.
- Define explicit create, update, and unique lookup interfaces.
- Keep list queries ordered and select only fields required by the caller.
- Use relation filters for scoped data rather than fetching broad data and filtering in memory.
- Log record IDs and counts, but never log sensitive payloads or credentials.
- Catch, log, and rethrow database errors so handlers can return the standard internal error response.

New functions should follow the existing `create...`, `getAll...`, `find...`, `update...`, and `delete...` naming pattern.
