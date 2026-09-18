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
