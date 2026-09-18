# Test Workflow Guide

Tests under `src/tests` protect API behavior and are organized by audience, domain, and endpoint. The detailed API endpoint test template is at `src/tests/api/test.md`.

## Structure

```text
src/tests/
├── api/
│   ├── admin/
│   └── client/
├── scripts/
└── teardown.ts
```

Each endpoint gets a dedicated folder containing focused unit, integration, and load tests when the endpoint supports load testing:

```text
[endpoint-name]/
├── [endpoint-name]-unit.test.ts
├── [endpoint-name]-integration.test.ts
└── [endpoint-name]-load.js
```

## Agent Workflow

1. Read the owning API module and its database service before writing tests.
2. Scaffold the endpoint test folder and use neighboring tests as the style reference.
3. Unit-test handlers in isolation; mock database services, utilities, events, and providers.
4. Integration-test through the application and Supertest against the real test database; do not mock Prisma.
5. Seed only the data required by the scenario and clean it up in `afterAll`.
6. Run Jest with `--runInBand` for integration tests to avoid Prisma connection-pool exhaustion.
7. Add a load script only when the endpoint is part of the load-test suite, and write its JSON summary beside the script.
8. When a test exposes a real implementation defect, fix the owning source module and rerun the focused test.
9. Record the final test results and any application changes in the endpoint `result.md`.

Tests must assert status codes, response contracts, validation failures, authorization behavior, service calls, and error forwarding where applicable. Do not weaken assertions simply to make a test pass.
