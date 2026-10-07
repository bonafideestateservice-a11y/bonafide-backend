---
name: endpoint-gap-check
description: Given a screenshot, mockup, or Figma export of an app page, checks whether backend API endpoints already exist to serve it. For each piece of data the page needs, states whether an endpoint is already set up (naming it and the table it uses), or if not, gives the full request/response body, maps each field to what it represents in the image, and names the database table (and column) it comes from or should be stored in. Flags when a table needs a new/changed column first, and lists which endpoints depend on that change. Use this whenever the user shares a UI image together with a question like "check if the endpoints for this page exist," "what endpoints do I need for this screen," "has this been built on the backend yet," "can the frontend build this page," or asks to audit a page's backend or database coverage, even if they phrase it loosely or don't use the word "endpoint."
---

# Endpoint Gap Check

Answers one question about a screen: **has the backend for this been built, and if not, exactly what needs building?** The reader is usually about to hand work to a frontend or backend developer, so the output must be precise enough to act on without re-reading the code.

## Workflow

### 1. Turn the image into a spec

List every piece of data the screen displays or collects: labels with values, counts, statuses, badges, dates, avatars, chart series, filters, tabs, search boxes, pagination, and every button or menu action. Group them by screen region (e.g. "stat cards", "recent activity", "requests table", "row actions menu").

Treat this list as the spec; everything below is checked against it. Two things are easy to miss:

- **Derived values.** A "+8%" trend, a weekly chart, or "5 total requests" needs a computation (a comparison period, a grouping, a count), not just a column. Note what it's derived from.
- **Interactions.** Tabs and filters need query parameters; search needs a search parameter; "View all" needs pagination; a row's "⋮" menu implies actions (view, assign, cancel...). If an action's purpose isn't clear from the image, list it as an open question instead of guessing.

Values in mockups are placeholder data. Use them to infer types and formats ("Jan 6, 2026" is a date, "Lagos, Nigeria" is a city plus country), not as real requirements.

### 2. Find the backend

Search the current repo; don't assume paths. Look for:

- **Routes:** Express routers (`router.get(...)`), NestJS controllers, FastAPI routers, etc. Follow how routers are mounted to get the full path (e.g. a router mounted at `/:version/admin` turns `/dashboard/stats` into `/api/v1/admin/dashboard/stats`).
- **What each route really returns:** read the handler **and** the service or query it calls. Route names and Swagger/OpenAPI comments can be wrong or stale; the handler's response is the source of truth.
- **The schema:** Prisma `schema.prisma`, ORM models, or migration files. Note enum values, nullable columns and relations.

If no repo is open or attached, ask which project to check rather than guessing from an earlier conversation.

For this repo specifically: routers are the `index.ts` files under `src/api/` (mounted in `src/routes.ts`), handlers are in each module's `handlers/` folder, database access is in `services/database/`, and the schema is `prisma/schema.prisma`.

### 3. Match each piece of data to an endpoint

An endpoint counts as **already set up** only if it already returns or accepts every field the page needs, in a usable form. One that's close but missing a field, filter or action is **needs a change**, not "already set up". Check carefully:

- **Display values:** does the endpoint return a display-ready value, or a raw enum the frontend would have to map? Does its status mapping match the tabs on screen?
- **Filters and tabs:** do they map to query parameters the endpoint actually supports?
- **Lists:** do they support the paging, sorting and search the screen implies?
- **Access:** is the endpoint protected for the right role (e.g. admin-only data behind admin auth)?

### 4. Check the schema for every new or changed field

If a field needs a column or table that doesn't exist, say so explicitly: the table, the new column, its type and nullability, before listing the endpoints that depend on it. Use the schema's real table and column names. Never invent one; if you can't tell where a field would live, say so and ask.

## Output format

Order sections so the first thing to act on is at the top. Use these headers in this order, and skip any with nothing to report:

```
## 1. Schema changes needed
## 2. Endpoints to create
## 3. Endpoints to change
## 4. Already set up
## 5. Open questions
```

**Schema changes:** one bullet per change: `Table.column` (type, nullable?), why the screen needs it, and which endpoints in sections 2–3 depend on it.

**Endpoints to create:** for each one, give the method and path, auth/role, and query parameters. Give the request body (if any) and response body as fenced JSON blocks with realistic values, then a short field map:

| Field | On screen | Source (table.column) |
| --- | --- | --- |

Only describe a field whose meaning isn't obvious from its name and the image.

**Endpoints to change:** name the existing endpoint (method, path, handler file). Say precisely what's missing or wrong today, then give the corrected response (or request) as JSON, marking new fields.

**Already set up:** a compact table: screen element → `METHOD /path` → table(s) it reads. One line each; no JSON needed.

**Open questions:** anything you couldn't resolve from the image or code: unclear actions, fields with no obvious home, business rules (e.g. "what period is the +8% compared against?").

Keep it tight. Don't narrate the whole screen; the reader can see the image.
