# Actuals Tracking — Design Spec

**Goal:** Let users log actual hours per deliverable after a project ships, compare against estimates, and see accuracy reports per phase and per project. Structured to support future AI calibration.

**Architecture:** New `actuals` table (one-to-one with scope items), new `delivered` project status, new API route file, new frontend phase on the existing project page.

**Tech Stack:** Drizzle ORM migration, Hono API routes, React frontend (same patterns as existing code).

---

## Data Model

### Project Status Extension

Add `"delivered"` to the existing `projectStatusEnum`. The lifecycle becomes:

```
draft → scoping → complete → delivered
```

Actuals entry is only available when status is `"delivered"`.

### `actuals` Table

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK, default random) | Primary key |
| scopeItemId | uuid FK → scope_items.id | Links to the scope item being measured |
| actualHours | integer, not null | Hours actually spent |
| notes | text, nullable | Optional context ("took longer because of X") |
| loggedAt | timestamp, default now | When the actual was entered |
| loggedBy | uuid FK → users.id | Who entered it |

One-to-one with scope items. No time entries or daily logs — just "how many hours did this actually take?" The notes field captures context for future AI calibration (why something was over/under estimate).

---

## API Routes

New route file: `apps/api/src/routes/actuals.ts`, mounted at `/api/actuals`.

### `POST /api/actuals/:scopeItemId`

Log actual hours for a scope item.

- **Body:** `{ actualHours: number, notes?: string }`
- **Auth:** requireAuth, logged-in user's ID used for `loggedBy`
- **Validation:** Project must be in "delivered" status. Reject if not.
- **Behavior:** Creates a row in the `actuals` table. If an actual already exists for this scopeItemId, return 409 (use PATCH to update).
- **Returns:** The created actual row.

### `PATCH /api/actuals/:id`

Update an existing actual (correct a mistake).

- **Body:** `{ actualHours?: number, notes?: string }`
- **Returns:** The updated actual row.

### `GET /api/actuals/:projectId/report`

Returns the full accuracy report.

- **Auth:** requireAuth, must be project owner.
- **Returns:**

```json
{
  "phases": [
    {
      "phase": "Discovery",
      "items": [
        {
          "id": "scope-item-uuid",
          "deliverable": "User research",
          "optimisticHours": 8,
          "likelyHours": 12,
          "pessimisticHours": 20,
          "actualHours": 14,
          "variancePercent": 16.7,
          "notes": "Extra stakeholder interviews"
        }
      ],
      "totals": {
        "estimatedLikely": 40,
        "actual": 46,
        "variancePercent": 15.0
      }
    }
  ],
  "project": {
    "totalEstimated": 120,
    "totalActual": 138,
    "variancePercent": 15.0,
    "accuracyScore": 85
  }
}
```

- `variancePercent` = `((actual - likely) / likely) * 100`. Positive means over, negative means under.
- `accuracyScore` = `max(0, 100 - abs(variancePercent))`. A project at exactly the likely estimate scores 100. Clamped to 0 at the floor.
- Items without actuals logged yet return `actualHours: null, variancePercent: null`.

### Status Transition

Extend existing `PATCH /api/projects/:id` to accept `status: "delivered"`. Only allow transition from "complete" to "delivered". No new endpoint needed.

---

## Frontend UX

All on the existing project page (`apps/web/src/app/project/[id]/page.tsx`). New UI phase triggered when project status is "delivered".

### "Mark as Delivered" Button

Appears on the project page when status is "complete", below the proposal generation section. Calls `PATCH /api/projects/:id` with `{ status: "delivered" }`. Transitions the UI to the actuals entry view.

### Actuals Entry View (Right Panel)

Same right-panel layout as the scope view. Each phase section shows its deliverables with:

- **Read-only:** Deliverable name, estimated hours displayed as "optimistic — likely — pessimistic"
- **Editable:** Actual hours input field (number input)
- **Optional:** Notes field, collapsed by default. Click "add note" to expand.
- **Live color indicator** on the actual hours input:
  - Green: within 10% of likely estimate
  - Yellow: 10-30% off
  - Red: 30%+ off
  - No color: actuals not yet entered

### Accuracy Report (Below Actuals Entry)

Updates live as actuals are entered — no separate "generate report" action.

**Per-phase rollup:**
- Phase name
- Total estimated (likely hours)
- Total actual hours
- Variance percentage
- Color-coded bar (same green/yellow/red thresholds)

**Project summary:**
- Overall estimated vs. actual
- Accuracy score (0-100)
- Summary sentence: "This project came in X% [over/under] the realistic estimate" or "This project came in right on target"

### Left Panel (Delivered Phase)

Replace the Q&A chat with a simple project status summary:
- "Scoping complete. Proposal generated. Now tracking actuals."
- Could show a mini timeline of the project lifecycle phases

---

## API Client Functions

Add to `apps/web/src/lib/api.ts`:

- `logActual(scopeItemId: string, actualHours: number, notes?: string)` — POST
- `updateActual(id: string, data: { actualHours?: number, notes?: string })` — PATCH
- `getAccuracyReport(projectId: string)` — GET

---

## Data Structure for Future AI Calibration

The actuals table stores structured data that a future calibration feature can query:

- Join `actuals` → `scopeItems` → `scopes` → `projects` to get: project type, phase, deliverable, estimated hours, actual hours, variance, notes
- Group by phase or project type to find systematic biases ("Discovery phases always run 20% over")
- The `notes` field provides unstructured context the AI can use to understand *why* estimates were off
- The `loggedBy` field enables per-person calibration if teams are added later

No AI integration is built now — just the data structure that makes it possible later.

---

## Out of Scope

- Time tracking / daily time logs (use Toggl/Harvest for that)
- Import from external time trackers (future feature)
- AI-powered estimate calibration (future feature, data structure supports it)
- Cross-project accuracy dashboard (future feature, needs multiple delivered projects)
- Team/multi-user actuals entry (loggedBy is stored but UI assumes single user for now)
