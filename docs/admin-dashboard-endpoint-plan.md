# Admin Dashboard: Endpoint Plan

**Status: implemented (8 Oct 2026)**, plus `DELETE /verification-requests/:id/assign-agent` (unassign). Question 5 was settled as: missing notification settings count as on, and in-app notifications are always recorded (the push setting only controls the phone push). Migration `20261008090000_admin_dashboard_trends_and_activity` still needs deploying. Nothing in the app changes a property's or agent's status yet; any endpoint that does must set `verifiedAt` / `deactivatedAt`.

The Admin Dashboard and Verification Requests screens need 5 new endpoints, changes to 2 existing ones, and 4 schema changes. The requests table, its tabs, search and the assign-agent action are already built.

- All paths start with `/api/v1/admin` and need an admin JWT (`Authorization: Bearer <token>`).
- Errors use the standard `{ "status": "error", "message": "..." }` body.
- Items marked **(open question N)** shouldn't be built until that question at the end is answered.

Suggested build order:

1. Schema changes, since the stats trends and the activity feed depend on them.
2. Agents list and request detail, which unblock the row actions.
3. Stats trends, activity feed and analytics chart.
4. Notifications inbox and mark-as-read.

---

## 1. Schema changes needed first

Three new nullable columns and one new table. The stat-card trends compare each number with its value 7 days ago, and three of those past values can't be worked out without the columns. The activity feed stays unreliable without the table.

### `Property.verifiedAt`: `DateTime`, nullable

- **Why:** the Verified Properties trend (+6%) needs to know how many properties were verified 7 days ago. Today there's only `status` and `createdAt`.
- **Rule:** set it when `status` becomes `VERIFIED`; clear it if the status changes away from `VERIFIED`.
- **Used by:** `GET /dashboard/stats`.

### `VerificationAgent.deactivatedAt`: `DateTime`, nullable

- **Why:** the Active Agents trend (−2%) needs to know how many agents were active 7 days ago, and `status` has no history.
- **Rule:** set it when an agent's status becomes `INACTIVE`; clear it when they're reactivated.
- **Used by:** `GET /dashboard/stats`.

### `Transaction.assignedAt`: `DateTime`, nullable

- **Why:** the Pending Requests trend (+6%) needs to know how many paid requests were waiting for an agent 7 days ago. A paid period waits from its payment (`paidAt`) until an agent is assigned, and nothing records the assignment time once a recurring assignment is deleted at the end of its period.
- **Rule:** set it on the period's payment (`AgentAssignment.transactionId`) when an agent is assigned; clear it when the agent is unassigned, since the period is waiting again.
- **Backfill:** `AgentAssignment.createdAt` for current assignments; for periods that already have a report, the report's `createdAt` (the agent was assigned before that, so it's an upper bound).
- **Used by:** `GET /dashboard/stats`.

### New table `ActivityLog`

- **Why:** the activity feed reads the `Notification` table, which has one row per recipient per channel (so events repeat), and skips rows when a user has a channel turned off (so events go missing).
- **Used by:** `GET /dashboard/activities`.

```prisma
model ActivityLog {
  id                    String               @id @default(cuid())
  type                  NotificationType     // reuses the existing enum
  verificationRequestId String?
  verificationRequest   VerificationRequest? @relation(fields: [verificationRequestId], references: [id])
  subjectName           String               // the name shown under the activity title
  createdAt             DateTime             @default(now())

  @@index([createdAt])
}
```

- `subjectName` is the client for a new request or payment, and the agent for an assignment or report.
- The event listeners (`src/events/listeners.ts`) write one row per event, alongside queueing notifications.
- Existing activity can be backfilled from `VerificationRequest`, `Transaction`, `AgentAssignment` and `VerificationReport`.

---

## 2. New endpoints

| Endpoint                                     | Screen element                    |
| -------------------------------------------- | --------------------------------- |
| `GET /dashboard/analytics`                   | Verification Analytics chart      |
| `GET /notifications`                         | Notification bell and its red dot |
| `PATCH /notifications/:id/read`, `/read-all` | Opening or clearing notifications |
| `GET /agents`                                | Agent picker for "Assign agent"   |
| `GET /verification-requests/:id`             | "View details" in the row menu    |

### `GET /api/v1/admin/dashboard/analytics`

One point per day for the chart.

- **Query:** `range` = `this_week` (default). Other values **(open question 2)**.
- **Response:**

```json
{
  "range": "this_week",
  "from": "2026-10-05T00:00:00.000Z",
  "to": "2026-10-11T23:59:59.999Z",
  "points": [
    { "label": "Mon", "date": "2026-10-05", "count": 3 },
    { "label": "Tue", "date": "2026-10-06", "count": 5 },
    { "label": "Sun", "date": "2026-10-11", "count": 0 }
  ]
}
```

- `points[].count`: the height of each point. Requests paid that day (the first `SUCCESS` `Transaction.paidAt` per request), or `VerificationRequest.createdAt` **(open question 3)**.
- `points[].label`: the x-axis day, derived from `date`.
- Days with no activity are returned with `count: 0`, so the chart always has 7 points.

### `GET /api/v1/admin/notifications`

The signed-in admin's own in-app notifications.

- **Query:** `page` (default 1), `limit` (default 20), `unreadOnly` (boolean).
- **Response:**

```json
{
  "data": [
    {
      "id": "8f1c2b7e-...",
      "type": "VERIFICATION_REQUEST_CREATED",
      "title": "New verification request",
      "body": "John Ahmed submitted a Land Verification request.",
      "read": false,
      "verificationRequestId": "cmg4x2k1p0001",
      "createdAt": "2026-10-07T09:12:00.000Z"
    }
  ],
  "unreadCount": 3,
  "meta": { "page": 1, "limit": 20, "totalItems": 14, "totalPages": 1 }
}
```

- **Source:** `Notification` rows where `userId` is the caller and `meta.channel = "in_app"`.
- `unreadCount` drives the red dot on the bell.
- The inbox is empty for admins with push notifications turned off **(open question 5)**.

### `PATCH /api/v1/admin/notifications/:id/read` and `/read-all`

- **Request:** no body.
- **Responses:**
  - `/:id/read` → `{ "id": "8f1c2b7e-...", "read": true }`
  - `/read-all` → `{ "updated": 3 }`
  - 404 if the notification isn't the caller's.
- A `markNotificationAsRead` service already exists in `src/api/services/database/notifications.ts`, but no route uses it.

### `GET /api/v1/admin/agents`

The list to choose from when assigning a request.

- **Query:** `status` (`ACTIVE` default, `INACTIVE`, `ALL`), `search` (name or region).
- **Response:**

```json
{
  "data": [
    {
      "id": "cmg3agent01",
      "name": "Cynthia Obi",
      "phone": "+2348098765432",
      "region": "Lagos",
      "status": "ACTIVE",
      "avatarUrl": null,
      "activeAssignments": 2
    }
  ]
}
```

- `name`, `phone`, `region`, `status`: `VerificationAgent`.
- `avatarUrl`: `User.profilePhoto` (via `VerificationAgent.userId`).
- `activeAssignments`: count of the agent's `AgentAssignment` rows with status `ASSIGNED`, `ACCEPTED` or `INSPECTION_SCHEDULED`. Helps the admin spread the workload.
- `id` is the value to send as `agentId` to the existing `POST /verification-requests/:id/assign-agent`.
- The only agent route today is `GET /agents/me`.

### `GET /api/v1/admin/verification-requests/:id`

Full detail for one request. Only needed if the row menu has a view action **(open question 4)**. Returns 404 if the request doesn't exist.

```json
{
  "id": "cmg4x2k1p0001",
  "status": "IN_PROGRESS",
  "client": {
    "id": "0b6c...",
    "name": "Michael Ikeh",
    "email": "michael@example.com",
    "phone": "+2348012345678",
    "avatarUrl": null
  },
  "verificationType": "Land Verification",
  "plan": { "name": "Monthly", "frequency": "MONTHLY" },
  "details": { "propertyType": "Land", "propertyAddress": "Osun, Nigeria" },
  "agent": { "id": "cmg3agent01", "name": "Cynthia Obi", "assignmentStatus": "ACCEPTED" },
  "payments": [
    {
      "id": "cmg4t01",
      "status": "SUCCESS",
      "amountInCents": 500000,
      "currency": "NGN",
      "paidAt": "2026-01-08T10:00:00.000Z"
    }
  ],
  "reports": [
    {
      "id": "cmg5r01",
      "generatedAt": "2026-01-20T12:00:00.000Z",
      "reviewStatus": "PENDING",
      "agentName": "Cynthia Obi"
    }
  ],
  "createdAt": "2026-01-08T09:00:00.000Z"
}
```

- `status`: `VerificationRequest.status`, mapped to the same display status the list uses.
- `client`: `User` (via `VerificationRequest.userId`). Never include the password.
- `verificationType`, `plan`: `VerificationType.name`, `VerificationPlan.name` and `frequency`.
- `agent`: the current `AgentAssignment` and its `VerificationAgent`; `null` when unassigned.
- `payments`: `Transaction` rows for the request, newest first.
- `reports`: `VerificationReport` rows, newest first. Monthly and quarterly plans have one per paid period.

---

## 3. Changes to existing endpoints

### `GET /api/v1/admin/dashboard/stats`

Handler: `src/api/admin/dashboard/handlers/get-dashboard-stats/`. It returns the four stat-card numbers but none of the trend percentages.

**Current response:**

```json
{
  "totalUsers": 1234,
  "numberOfPendingRequest": 45,
  "numberOfActiveAgents": 28,
  "numberOfProperties": 892
}
```

**Proposed:** the existing fields stay as they are, so the current frontend keeps working. `trends` and `comparedTo` are new.

```json
{
  "totalUsers": 1234,
  "numberOfPendingRequest": 45,
  "numberOfActiveAgents": 28,
  "numberOfProperties": 892,
  "trends": {
    "totalUsers": 8.0,
    "numberOfPendingRequest": 6.0,
    "numberOfActiveAgents": -2.0,
    "numberOfProperties": 6.0
  },
  "comparedTo": "last_week"
}
```

How each trend is computed:

Every trend compares the card's number now with the same number exactly 7 days ago:

```
change % = (value now − value 7 days ago) / value 7 days ago × 100
```

Rounded to one decimal; `null` when the value 7 days ago was 0. Both values are computed with the same rule, so they're comparable.

- **`trends.totalUsers`** (+8% on Total Users): client accounts that existed then vs now. Value at time t = clients with `User.createdAt` ≤ t. No schema change.
- **`trends.numberOfPendingRequest`** (+6% on Pending Requests): the change in how many paid requests are waiting for an agent. Value at time t = requests (not `CANCELLED`) with a `SUCCESS` transaction whose `paidAt` ≤ t and whose `assignedAt` is empty or later than t. Needs `Transaction.assignedAt`. "Now" should equal the card's own count (`SUBMITTED` requests); check this when building.
- **`trends.numberOfActiveAgents`** (−2% on Active Agents): the change in active agents. Value at time t = agents with `createdAt` ≤ t and `deactivatedAt` empty or later than t. Needs `VerificationAgent.deactivatedAt`.
- **`trends.numberOfProperties`** (+6% on Verified Properties): the change in verified properties. Value at time t = properties with `verifiedAt` ≤ t. Needs `Property.verifiedAt`.

For the frontend: a growing pending backlog is bad news, so show a rising Pending Requests trend in red (the mockup shows +6% in green). For the other three cards, up is good.

Also fix while here: the handler loads every client and every agent into memory just to count them. Replace those with `count()` queries.

### `GET /api/v1/admin/dashboard/activities`

Handler: `src/api/admin/dashboard/handlers/get-all-activities/`. It returns every sent `Notification` row as `{ "activities": [...] }`, which means:

- the same event appears several times (one row per recipient per channel);
- events are missing when the recipient has that channel turned off;
- there's no paging for "View all";
- the name under each title is only set for some event types.

**Proposed:** read from the new `ActivityLog` table, and add `page` (default 1) and `limit` (default 20; the dashboard card uses `limit=5`).

```json
{
  "data": [
    {
      "id": "cmg6act01",
      "type": "AGENT_ASSIGNED",
      "subjectName": "Kingsley Ikeh",
      "verificationRequestId": "cmg4x2k1p0001",
      "createdAt": "2026-10-07T07:12:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 5, "totalItems": 128, "totalPages": 26 }
}
```

- `type`: the activity title ("Verification Request", "Report Uploaded", "Agent Assigned"). The frontend maps each type to its label.
- `subjectName`: the name under the title.
- `createdAt`: shown as "2 hours ago"; the frontend formats it.

**This is a breaking change:** the top-level key changes from `activities` to `data`. Update the frontend at the same time.

---

## 4. Already set up

These need no backend work; the frontend can build against them now.

- **"Welcome, John" and avatar:** `GET /profile` → `fullName`, `profilePhoto` (`User`).
- **Stat card numbers** (not the trends): `GET /dashboard/stats`.
- **Dashboard requests table:** `GET /verification-requests?limit=4`.
- **Verification Requests page**, all from `GET /verification-requests`:
  - **Tabs** All, Pending, Assigned, In Progress, Completed → `status=all`, `pending`, `assigned`, `in_progress`, `completed`.
  - **Search box** → `search` (client name, type or address).
  - **"5 total requests" and per-tab counts** → `meta.totalItems` and `counts`.
  - **Columns** → `client.name`, `client.avatarUrl`, `propertyType`, `location.city`, `location.country`, `status`, `agent` (`null` = "Not assigned"), `createdAt`.
  - **Paging and sorting** → `page`, `limit` (max 100), `sortBy` (`createdAt` or `status`), `sortOrder`.
- **"Assign agent" action:** `POST /verification-requests/:id/assign-agent` with `{ "agentId": "..." }`.

One quirk to settle before building the tabs: drafts and unpaid requests show the **Pending** badge under All, but the **Pending** tab only lists paid requests waiting for an agent. Either hide unpaid requests from the admin list, or give them their own badge such as "Awaiting payment".

---

## 5. Open questions

Answer these before building the items that depend on them.

- [x] **1. Trend periods.** Answered:
  - Every trend compares now with exactly 7 days ago ("vs last week").
  - Active Agents is the change in active agents.
  - Pending Requests is the change in how many paid requests are waiting for an agent.
- [ ] **2. Chart range.** What else can the "This week" dropdown pick: last week, this month, a custom range? and a last week, and this month
- [ ] **3. Chart metric.** Does the chart count requests paid, requests created, or reports completed? Request paid
- [ ] **4. Row menu.** Which actions are in the "⋮" menu? This plan assumes View details and Assign agent. Cancel, reassign or unassign would each need their own endpoint. View details and unsassign and assign details
- [ ] **5. Notification defaults: inbox, push and email.** Users with no `NotificationSettings` row (everyone who has never saved their settings) count as having push and email **off**: `isNotificationChannelEnabled` returns `false` for a missing row, and the schema defaults are `false`. So today:
  - the bell would be empty for most admins, because in-app notifications are only recorded when push is on;
  - tracked emails are silently skipped for those users: payment receipts, "verification request created", "agent assigned", "inspection started" and "report uploaded". The welcome and password-reset emails still send, because they bypass the settings check.

  Proposed (decide which to adopt):
  - **Inbox:** always record in-app notifications; the push setting only decides whether a phone push is sent (`src/jobs/notifications/processors.ts`). Turning off phone pushes then doesn't empty the bell.
  - **Defaults:** treat a missing settings row as push **on** and email **on**, and change the schema defaults for `NotificationSettings.push` and `email` to `true`. Phone pushes still only reach devices whose user allowed notifications in the OS prompt.
  - **Existing rows:** rows already saved with `push` or `email` set to `false` can't be told apart from deliberate opt-outs. Either leave them as they are, or turn them on in a migration and override some real choices.
  - **Receipts:** always send payment receipts, whatever the email setting, like password resets.

---

## 6. Properties and Agents pages (implemented 9 Oct 2026)

Decisions: "Active" tab = available agents only; when nobody has room, suspending unassigns the job; `Property.title` dropped (`name` is the title); floor area stored as a decimal (`sizeSqm`, `Float`).

**Schema** (migration `20261009090000_property_details`):

- `Property`: added `description`, `bedrooms`, `bathrooms`, `sizeSqm`, `yearBuilt`, `amenities` (`PropertyAmenity[]`), `imageUrls` (up to 4); dropped `title` (copied into `name` first).
- `Property.priceAmount` is now `BigInt`, so prices above ₦2.1bn fit. The API returns it as a number.

**New endpoints:**

- `POST /admin/properties`: Add Property (multipart form). Fields: `title`, `propertyType`, `priceAmount`, `location` (required); `description`, `bedrooms`, `bathrooms`, `sizeSqm`, `yearBuilt`, `amenities` (repeat per amenity), `isPublished`; files `coverImage` (1) and `images` (up to 4), PNG or JPEG, max 5 MB each. `location` "Lekki Phase 1, Lagos" is split into area and city.
- `PATCH /admin/agents/:id/status` with `{ "status": "INACTIVE" | "ACTIVE" }`: suspend or reactivate. Suspending moves each open job to the active agent with the fewest open jobs and room, or unassigns it; returns `{ id, status, reassigned, unassigned }`.

**Changed endpoints:**

- `GET /admin/agents`: now `tab=all|active|busy`, adds `email`, `displayStatus` (`AVAILABLE`, `BUSY` at 5 open jobs, `SUSPENDED`) and `counts`.
- `POST /admin/verification-requests/:id/assign-agent`: 409 "Agent is fully booked. Agents can only handle 5 properties at a time." when the agent has 5 open jobs.
- `GET /admin/properties`: each item adds `address`, `description`, `bedrooms`, `bathrooms`, `sizeSqm`, `yearBuilt`, `amenities`, `imageUrls`; `title` now comes from `name`.
