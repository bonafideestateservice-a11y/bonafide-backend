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
