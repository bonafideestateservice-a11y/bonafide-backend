# TESTING RULES

## Source: src/tests/api/test.instructions.md

---
description: API endpoint test structure and execution rules
applyTo: "src/tests/api/**/*.ts"
---

Follow `src/tests/api/test.md`.

- Give each endpoint its own test directory.
- Add unit and integration coverage for endpoint behavior.
- Mock database services in unit tests; use real Prisma in integration tests.
- Seed and clean up integration data.
- Record final results in the endpoint result documentation when required.


## Source: src/tests/api/test.md

# Endpoint Testing Strategy and Structure

This document outlines the standard structure and instructions for testing API endpoints in this project. You should use this template when scaffolding new tests for any module (e.g., Admin Authentication).

## Folder Structure

Each individual endpoint MUST have its own dedicated folder within the appropriate module's test directory. 
For example, if you are testing an endpoint called `create-user`, the folder structure should look like this:

```
src/tests/api/[module_name]/[group_name]/create-user/
├── create-user-unit.test.ts
├── create-user-integration.test.ts
└── create-user-load.js
```

### 1. Unit Tests (`*-unit.test.ts`)
- **Purpose**: Test the handler function in complete isolation.
- **Dependencies**: ALL external dependencies (database services, bcrypt, jwt, external APIs, etc.) MUST be mocked using `jest.mock()`.
- **Express Mocks**: Construct fake Express `Request`, `Response`, and `NextFunction` objects.
- **Assertions**: Verify that the correct status codes are returned, `next(error)` is called correctly for failures, and services are called with expected arguments.

### 2. Integration Tests (`*-integration.test.ts`)
- **Purpose**: Test the endpoint end-to-end against a real database instance using Supertest.
- **Dependencies**: Do NOT mock the database. You must use the real database services.
- **Database State**: 
  - Use `beforeAll` to seed the necessary test data into the database.
  - Use `afterAll` to clean up the seeded data and call `prismaClient.$disconnect()` to prevent connection leaks.
- **Execution**: These tests must be run with the `--runInBand` flag (e.g., `jest --runInBand`) to prevent Prisma database connection pool exhaustion.

### 3. Load Tests (`*-load.js`)
- **Purpose**: Test the endpoint's performance under concurrent load using `k6`.
- **Structure**: 
  - Define `options` (stages, thresholds).
  - Seed a pool of users/data to prevent caching anomalies or database row lock contention.
  - Assert on response times and error rates.
  - Implement a `handleSummary` function to output a JSON summary in the same directory.

---

## LLM Execution Instructions

When you (the LLM) are tasked with generating tests using this document as a guide, you must adhere to the following workflow:

1. **Scaffold the Tests**: Create the unit, integration, and load test files for the target endpoint according to the structure above.
2. **Run the Tests**: Execute the unit and integration tests using Jest.
3. **Iterative Fixing**: 
   - If the tests fail, analyze the error.
   - You are authorized and expected to **make changes to the actual endpoint implementation** (handlers, services, etc.) or fix the tests themselves.
   - Re-run the tests.
   - Repeat this process until all tests pass successfully.
4. **Output Results**: Once the tests are passing, generate a `result.md` file in the same directory as the tests. This file should contain:
   - A summary of the tests created.
   - The final test execution output/results.
   - A list of any modifications you had to make to the actual application code to get the tests passing.


## Source: src/tests/tests.instructions.md

---
description: Repository test workflow rules
applyTo: "src/tests/**/*.ts"
---

Follow `src/tests/tests.md`.

- Organize tests by audience, domain, and endpoint.
- Unit tests mock external dependencies.
- Integration tests use the real database and Supertest.
- Clean up all records created by integration tests.
- Run integration tests with `--runInBand`.


## Source: src/tests/tests.md

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


