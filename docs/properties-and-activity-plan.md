# Properties page and Recent Activity page changes

**Status:** implemented 13 Oct 2026 (migration `20261013090000_activity_details`).

**Screens:** admin Properties (the grid of property cards) and admin Recent Activity (the full feed you reach from the dashboard).

## 1. Properties page

### Already set up

- `GET /api/v1/admin/properties` (table `Property`):
  - Tabs All / Published / Unpublished: `?status=all|published|unpublished`.
  - Search: `?search=`.
  - "8 Properties Listed": `counts.all` (or `meta.totalItems` for the current tab).
  - Card fields:
    - `coverImageUrl`, `title`, `type`, `location.area` (or `address`)
    - `price.amount`, `viewCount`
    - `isPublished` (shows the "Unpublished" badge)
- "Assign Property" button:
  - `GET /api/v1/admin/agents` to pick an agent.
  - `POST /api/v1/admin/properties/:id/assign-agent` with `{ "agentId" }`.
  - Returns 409 once the agent has 5 properties.

### Changes

1. **Show the assigned agent on each card.**
   - Add `agent { id, name }` (or null) to each item in `GET /admin/properties`. Read it from the `Property.agentId` relation.
   - This lets the frontend show "Assigned to …" or "Reassign" instead of "Assign Property".
   - `GET /admin/properties/:id` already returns it.
   - No schema change.
2. **Show which agents are full on properties in the agent picker.**
   - Add `assignedPropertyCount` to each agent in `GET /admin/agents`. It counts the `Property` rows with that `agentId` that aren't deleted.
   - Today an agent with 5 properties still looks available, and the admin only finds out from the 409.
   - No schema change.

## 2. Recent Activity page

### How activity is recorded today

- Activity rows live in their own table, `ActivityLog`. They are **not** read from the `Notification` table.
- How a row gets written:
  1. The assign service emits the `AGENT_ASSIGNED` event (`appEvents.emit` in `src/api/admin/verification/services/database/agent-assignment.ts`).
  2. The listener in `src/events/listeners.ts` handles each event twice: it queues the notifications (`enqueueNotificationEvent`, which goes on to email, push and in-app `Notification` rows) and separately writes the activity row (`recordActivity`).
  3. `recordActivity` (`src/api/services/database/activity-log.ts`) saves `type`, `verificationRequestId`, `subjectName` and `createdAt`.
- The same flow handles `VERIFICATION_REQUEST_CREATED`, `PAYMENT_RECEIVED`, `INSPECTION_STARTED` and `REPORT_UPLOADED`. Sign-ups and password resets aren't recorded.
- `subjectName` is a single name, and who it is depends on the event:
  - **Request created:** the client.
  - **Payment received:** the payer's first name.
  - **Agent assigned, inspection started, report uploaded:** the agent.
- `GET /api/v1/admin/dashboard/activities` returns these rows newest first, paginated.

### What the screen needs that's missing

- **The client's name on every row.** On "Agent Assigned" the screen shows the client (Michael Brown) under the row, with the agent named in the description. Today only the agent's name is stored for that row.
- **The payment amount** ("Payment of ₦75,000 received").
- **The verification type** ("Land verification request submitted").
- **A status badge** (Pending, In Progress, Completed).
- **"Property Added" rows** ("4 Bedroom Duplex added to listings"). Adding a property doesn't emit an event or record an activity.

### Changes

**Schema (`ActivityLog`):**

- Add `clientName String?`: the client the activity is about.
- Add `agentName String?`: for agent assigned, inspection started and report uploaded.
- Add `amount Int?`: the payment amount in kobo, for payment received.
- Add `propertyId String?`: a link to `Property` for "Property Added". It is set to null if the property row is removed; soft-deleted properties keep the link.
- Add `PROPERTY_ADDED` to the `NotificationType` enum, which `ActivityLog.type` uses.
- Keep `subjectName` so existing rows still show a name. New rows still fill it in the same way.
- Existing rows get no backfill: they have no `clientName`, `agentName` or `amount`.

**Recording (`recordActivity`):**

1. Fill in `clientName` from the request's user on every request event.
2. Fill in `agentName` on agent events.
3. Fill in `amount` from the payment on `PAYMENT_RECEIVED`.
4. When an admin adds a property (`POST /admin/properties`):
   - Record a `PROPERTY_ADDED` activity with `propertyId`, the property's title as `subjectName`, and the admin's name as `clientName`.
   - Write it directly with no event, since nobody is notified.
   - If recording fails, the error is logged and the property is still created.

**Response (`GET /admin/dashboard/activities`):** each item adds:

- `clientName`, `agentName`, `amount` (in naira).
- `verificationType`: from the request's verification type.
- `status`: the request's current status, using the same rule as the verification requests list (`PENDING`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, and so on). Null for "Property Added".
- `property { id, title }`: for "Property Added".

The frontend builds each row's title and description from `type` plus these fields.

**Endpoints affected by the schema change:**

- `GET /admin/dashboard/activities` (this page and the dashboard's recent activity card).
- `GET /admin/users/:id` (its `recentActivity` list reads the same table; it should return the same new fields).
- `POST /admin/properties` (records the new activity).

## 3. Tests

- Unit and integration tests for each changed endpoint:
  - `get-all-properties`
  - `get-agents`
  - `get-all-activities`
  - `get-user`
  - `create-property`
- The `recordActivity` unit tests: check the new fields for each event type.
