---
description: In-process event bus rules
applyTo: "src/events/**/*.ts"
---

Follow `src/events/events.md`.

- Add event names to `AppEventTypes`.
- Type listener payloads.
- Emit events after successful primary operations.
- Keep listeners small and delegate provider work to `src/libs`.
