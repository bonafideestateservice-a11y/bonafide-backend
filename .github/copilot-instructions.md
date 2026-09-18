# Repository Instructions

Use the nearest applicable `*.instructions.md` file as the active rule set for the files being changed. Read the linked `.md` guide for detailed repository conventions.

- Preserve existing architecture and public APIs unless the task requires a change.
- Keep changes focused and avoid unrelated refactors.
- Add or update tests for behavior changes.
- Run focused tests and `npx tsc --noEmit` after implementation changes.
- Do not treat generated test `result.md` files as implementation guides.
