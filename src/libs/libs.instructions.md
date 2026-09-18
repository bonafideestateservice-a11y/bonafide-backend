---
description: External integration adapter rules
applyTo: "src/libs/**/*.ts"
---

Follow `src/libs/libs.md`.

- Keep provider-specific behavior inside the relevant adapter.
- Use typed integration inputs and stable application-facing outputs.
- Never log secrets or credentials.
- Mock adapters in unit tests.
