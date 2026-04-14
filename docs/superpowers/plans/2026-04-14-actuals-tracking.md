# Actuals Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users log actual hours per deliverable after project delivery, and see per-phase and per-project accuracy reports comparing estimates to actuals.

**Architecture:** New `actuals` table (one-to-one with scope items), extend `projectStatusEnum` with "delivered", new API route file for actuals CRUD + report, new frontend phase on the existing project page with actuals entry and live accuracy report.

**Tech Stack:** Drizzle ORM + PostgreSQL (migration), Hono (API routes), React/Next.js (frontend), existing patterns throughout.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/db/src/schema.ts` | Modify | Add `actuals` table, extend `projectStatusEnum` |
| `packages/db/src/migrations/0003_*.sql` | Create (generated) | Migration for schema changes |
| `apps/api/src/routes/actuals.ts` | Create | POST/PATCH/GET endpoints for actuals |
| `apps/api/src/index.ts` | Modify | Mount actuals router |
| `apps/web/src/lib/api.ts` | Modify | Add actuals API client functions, add `status` to `updateProject` |
| `apps/web/src/app/project/[id]/page.tsx` | Modify | Add "delivered" phase, actuals entry UI, accuracy report |

---

### Task 1: Schema — Add `actuals` table and extend project status enum

**Files:**
- Modify: `packages/db/src/schema.ts:14-19` (projectStatusEnum) and append new table after line 145

- [ ] **Step 1: Add "delivered" to the projectStatusEnum**

In `packages/db/src/schema.ts`, change line 14-19 from:

```typescript
export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "scoping",
  "complete",
  "proposal_sent",
]);
```

to:

```typescript
export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "scoping",
  "complete",
  "proposal_sent",
  "delivered",
]);
```

- [ ] **Step 2: Add the `actuals` table**

In `packages/db/src/schema.ts`, after the `proposals` table (after line 145), add:

```typescript
export const actuals = pgTable("actuals", {
  id: uuid("id").defaultRandom().primaryKey(),
  scopeItemId: uuid("scope_item_id").references(() => scopeItems.id).notNull().unique(),
  actualHours: integer("actual_hours").notNull(),
  notes: text("notes"),
  loggedAt: timestamp("logged_at").defaultNow().notNull(),
  loggedBy: uuid("logged_by").references(() => users.id).notNull(),
});
```

Note: `scopeItemId` has `.unique()` to enforce one-to-one with scope items.

- [ ] **Step 3: Generate the migration**

Run from `packages/db`:

```bash
cd packages/db && npx drizzle-kit generate
```

Expected: Creates `src/migrations/0003_*.sql` with ALTER TYPE for the enum and CREATE TABLE for actuals.

- [ ] **Step 4: Run the migration**

```bash
cd packages/db && npx drizzle-kit push
```

Expected: Schema applied to database without errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/migrations/
git commit -m "feat: add actuals table and delivered project status"
```

---

### Task 2: API — Actuals routes (CRUD + report)

**Files:**
- Create: `apps/api/src/routes/actuals.ts`
- Modify: `apps/api/src/index.ts:1-24` (add import and mount)

- [ ] **Step 1: Create the actuals route file**

Create `apps/api/src/routes/actuals.ts`:

```typescript
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db, actuals, scopeItems, scopes, projects } from "@scoper/db";
import { requireAuth } from "../middleware/auth";

const actualsRouter = new Hono();
actualsRouter.use("*", requireAuth);

// Log actual hours for a scope item
actualsRouter.post("/:scopeItemId", async (c) => {
  const userId = c.get("userId" as never) as string;
  const scopeItemId = c.req.param("scopeItemId");
  const { actualHours, notes } = await c.req.json<{ actualHours: number; notes?: string }>();

  // Verify scope item exists and user owns the project
  const [item] = await db
    .select({ scopeId: scopeItems.scopeId })
    .from(scopeItems)
    .where(eq(scopeItems.id, scopeItemId));
  if (!item) return c.json({ error: "Scope item not found" }, 404);

  const [scope] = await db.select().from(scopes).where(eq(scopes.id, item.scopeId));
  if (!scope) return c.json({ error: "Scope not found" }, 404);

  const [project] = await db.select().from(projects).where(eq(projects.id, scope.projectId));
  if (!project || project.createdBy !== userId) return c.json({ error: "Not found" }, 404);
  if (project.status !== "delivered") return c.json({ error: "Project must be in delivered status" }, 400);

  // Check if actual already exists
  const [existing] = await db.select().from(actuals).where(eq(actuals.scopeItemId, scopeItemId));
  if (existing) return c.json({ error: "Actual already logged for this item. Use PATCH to update." }, 409);

  try {
    const [created] = await db
      .insert(actuals)
      .values({ scopeItemId, actualHours, notes: notes ?? null, loggedBy: userId })
      .returning();
    return c.json(created, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Update an existing actual
actualsRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ actualHours?: number; notes?: string }>();

  try {
    const [updated] = await db
      .update(actuals)
      .set({
        ...(body.actualHours !== undefined && { actualHours: body.actualHours }),
        ...(body.notes !== undefined && { notes: body.notes }),
      })
      .where(eq(actuals.id, id))
      .returning();

    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json(updated);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Get accuracy report for a project
actualsRouter.get("/:projectId/report", async (c) => {
  const userId = c.get("userId" as never) as string;
  const projectId = c.req.param("projectId");

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.createdBy, userId)));
  if (!project) return c.json({ error: "Not found" }, 404);

  const [scope] = await db
    .select()
    .from(scopes)
    .where(and(eq(scopes.projectId, projectId), eq(scopes.isActive, true)));
  if (!scope) return c.json({ error: "No active scope" }, 404);

  // Get all scope items with their actuals (left join)
  const items = await db
    .select({
      id: scopeItems.id,
      phase: scopeItems.phase,
      deliverable: scopeItems.deliverable,
      optimisticHours: scopeItems.optimisticHours,
      likelyHours: scopeItems.likelyHours,
      pessimisticHours: scopeItems.pessimisticHours,
      actualId: actuals.id,
      actualHours: actuals.actualHours,
      notes: actuals.notes,
    })
    .from(scopeItems)
    .leftJoin(actuals, eq(scopeItems.id, actuals.scopeItemId))
    .where(eq(scopeItems.scopeId, scope.id));

  // Group by phase
  const phaseMap = new Map<string, typeof items>();
  for (const item of items) {
    const existing = phaseMap.get(item.phase) ?? [];
    existing.push(item);
    phaseMap.set(item.phase, existing);
  }

  const phases = Array.from(phaseMap).map(([phase, phaseItems]) => {
    const estimatedLikely = phaseItems.reduce((s, i) => s + (i.likelyHours ?? 0), 0);
    const loggedItems = phaseItems.filter((i) => i.actualHours !== null);
    const actual = loggedItems.reduce((s, i) => s + (i.actualHours ?? 0), 0);
    const variancePercent = estimatedLikely > 0 ? ((actual - estimatedLikely) / estimatedLikely) * 100 : null;

    return {
      phase,
      items: phaseItems.map((i) => {
        const likely = i.likelyHours ?? 0;
        const itemVariance = i.actualHours !== null && likely > 0
          ? ((i.actualHours - likely) / likely) * 100
          : null;
        return {
          id: i.id,
          deliverable: i.deliverable,
          optimisticHours: i.optimisticHours ?? 0,
          likelyHours: likely,
          pessimisticHours: i.pessimisticHours ?? 0,
          actualHours: i.actualHours,
          actualId: i.actualId,
          variancePercent: itemVariance !== null ? Math.round(itemVariance * 10) / 10 : null,
          notes: i.notes,
        };
      }),
      totals: {
        estimatedLikely,
        actual: loggedItems.length > 0 ? actual : null,
        variancePercent: variancePercent !== null && loggedItems.length > 0 ? Math.round(variancePercent * 10) / 10 : null,
      },
    };
  });

  const totalEstimated = items.reduce((s, i) => s + (i.likelyHours ?? 0), 0);
  const loggedItems = items.filter((i) => i.actualHours !== null);
  const totalActual = loggedItems.reduce((s, i) => s + (i.actualHours ?? 0), 0);
  const projectVariance = totalEstimated > 0 && loggedItems.length > 0
    ? ((totalActual - totalEstimated) / totalEstimated) * 100
    : null;
  const accuracyScore = projectVariance !== null
    ? Math.max(0, Math.round(100 - Math.abs(projectVariance)))
    : null;

  return c.json({
    phases,
    project: {
      totalEstimated,
      totalActual: loggedItems.length > 0 ? totalActual : null,
      variancePercent: projectVariance !== null ? Math.round(projectVariance * 10) / 10 : null,
      accuracyScore,
    },
  });
});

export default actualsRouter;
```

- [ ] **Step 2: Mount the router in the API entry point**

In `apps/api/src/index.ts`, add import after line 9:

```typescript
import actualsRouter from "./routes/actuals";
```

And add route after line 24:

```typescript
app.route("/api/actuals", actualsRouter);
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd /Users/ryanhaugland/scoper && npx tsc --noEmit -p apps/api/tsconfig.json
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/actuals.ts apps/api/src/index.ts
git commit -m "feat: add actuals API routes (CRUD + accuracy report)"
```

---

### Task 3: API Client — Add actuals functions and status to updateProject

**Files:**
- Modify: `apps/web/src/lib/api.ts:44-54` (updateProject type) and append new functions

- [ ] **Step 1: Add `status` to the `updateProject` type signature**

In `apps/web/src/lib/api.ts`, change the `updateProject` function (lines 44-54) from:

```typescript
export const updateProject = (id: string, data: {
  name?: string;
  clientName?: string;
  blendedRate?: number;
  marginPercent?: number;
  weeklyCapacity?: number;
}) =>
  request<any>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
```

to:

```typescript
export const updateProject = (id: string, data: {
  name?: string;
  clientName?: string;
  status?: string;
  blendedRate?: number;
  marginPercent?: number;
  weeklyCapacity?: number;
}) =>
  request<any>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
```

- [ ] **Step 2: Add actuals API client functions**

In `apps/web/src/lib/api.ts`, after the Risks section (after line 161), add:

```typescript

// Actuals
export const logActual = (scopeItemId: string, actualHours: number, notes?: string) =>
  request<any>(`/api/actuals/${scopeItemId}`, {
    method: "POST",
    body: JSON.stringify({ actualHours, notes }),
  });

export const updateActual = (id: string, data: { actualHours?: number; notes?: string }) =>
  request<any>(`/api/actuals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const getAccuracyReport = (projectId: string) =>
  request<any>(`/api/actuals/${projectId}/report`);
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd /Users/ryanhaugland/scoper && npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add actuals API client functions"
```

---

### Task 4: Frontend — State restoration from project.status on page load

**Context:** Currently the page always starts with `phase="input"` and only transitions in-session. Before adding the "delivered" phase, we need to restore the correct phase when reloading a project that's already in "complete" or "delivered" status.

**Files:**
- Modify: `apps/web/src/app/project/[id]/page.tsx:107` (phase type), `133-143` (useEffect)

- [ ] **Step 1: Extend the phase type to include "delivered"**

In `apps/web/src/app/project/[id]/page.tsx`, change line 107 from:

```typescript
  const [phase, setPhase] = useState<"input" | "scoping" | "complete">("input");
```

to:

```typescript
  const [phase, setPhase] = useState<"input" | "scoping" | "complete" | "delivered">("input");
```

- [ ] **Step 2: Restore phase and scope data from project status on load**

In `apps/web/src/app/project/[id]/page.tsx`, replace the first useEffect (lines 133-143):

```typescript
  useEffect(() => {
    getProject(projectId).then((p) => {
      setProject(p);
      setRateConfig({
        blendedRate: p.blendedRate ?? 0,
        marginPercent: p.marginPercent ?? 0,
        weeklyCapacity: p.weeklyCapacity ?? 30,
      });
    }).catch(() => router.push("/dashboard"));
    listInputs(projectId).then(setInputs);
  }, [projectId, router]);
```

with:

```typescript
  useEffect(() => {
    getProject(projectId).then(async (p) => {
      setProject(p);
      setRateConfig({
        blendedRate: p.blendedRate ?? 0,
        marginPercent: p.marginPercent ?? 0,
        weeklyCapacity: p.weeklyCapacity ?? 30,
      });
      // Restore phase from server status
      if (p.status === "delivered" || p.status === "complete" || p.status === "scoping") {
        // Find the active scope to restore state
        const scopes = await listScopes(projectId);
        if (scopes.length > 0) {
          const activeScope = scopes[0];
          setScopeId(activeScope.id);
          const state = await getScopeState(activeScope.id);
          setScopeItems(state.scopeItems);
          setAssumptions(state.assumptions);
          setRisks(state.risks);
          setQuestions(state.questions);
          setSummary(state.draft?.summary ?? "");
          if (p.status === "delivered") {
            setPhase("delivered");
          } else if (p.status === "complete") {
            setPhase("complete");
          } else {
            setPhase("scoping");
          }
        }
      }
    }).catch(() => router.push("/dashboard"));
    listInputs(projectId).then(setInputs);
  }, [projectId, router]);
```

- [ ] **Step 3: Add the `listScopes` API function**

We need a way to get the active scope for a project. In `apps/web/src/lib/api.ts`, after the `getScopeState` function, add:

```typescript
export const listScopes = (projectId: string) =>
  request<any[]>(`/api/scoping/${projectId}/scopes`);
```

- [ ] **Step 4: Add the scopes list endpoint to the API**

In `apps/api/src/routes/scoping.ts`, after the "Start a scoping session" route (after line 19), add:

```typescript
// List scopes for a project
scopingRouter.get("/:projectId/scopes", async (c) => {
  const projectId = c.req.param("projectId");
  const rows = await db
    .select()
    .from(scopes)
    .where(and(eq(scopes.projectId, projectId), eq(scopes.isActive, true)));
  return c.json(rows);
});
```

Note: The `and` import already exists in the scoping router imports.

- [ ] **Step 5: Add imports to the frontend page**

In `apps/web/src/app/project/[id]/page.tsx`, add `listScopes` to the import block:

```typescript
import {
  getProject,
  listInputs,
  addInput,
  startScoping,
  getScopeState,
  listScopes,
  answerQuestion as apiAnswerQuestion,
  // ... rest unchanged
```

- [ ] **Step 6: Verify TypeScript compilation**

```bash
cd /Users/ryanhaugland/scoper && npx tsc --noEmit -p apps/api/tsconfig.json && npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/project/[id]/page.tsx apps/web/src/lib/api.ts apps/api/src/routes/scoping.ts
git commit -m "feat: restore project phase from server status on page load"
```

---

### Task 5: Frontend — "Mark as Delivered" button and actuals entry UI

**Files:**
- Modify: `apps/web/src/app/project/[id]/page.tsx` — add imports, state, handlers, and UI

- [ ] **Step 1: Add imports for actuals API functions**

In `apps/web/src/app/project/[id]/page.tsx`, add to the import block:

```typescript
import {
  // ... existing imports ...
  logActual,
  updateActual,
  getAccuracyReport,
} from "@/lib/api";
```

- [ ] **Step 2: Add an `ActualEntry` interface and report state**

After the existing `Risk` interface (around line 57), add:

```typescript
interface ActualEntry {
  id: string;
  deliverable: string;
  optimisticHours: number;
  likelyHours: number;
  pessimisticHours: number;
  actualHours: number | null;
  actualId: string | null;
  variancePercent: number | null;
  notes: string | null;
}

interface PhaseReport {
  phase: string;
  items: ActualEntry[];
  totals: { estimatedLikely: number; actual: number | null; variancePercent: number | null };
}

interface AccuracyReport {
  phases: PhaseReport[];
  project: { totalEstimated: number; totalActual: number | null; variancePercent: number | null; accuracyScore: number | null };
}
```

- [ ] **Step 3: Add state variables for actuals**

After the existing `newItem` state (around line 130), add:

```typescript
  const [report, setReport] = useState<AccuracyReport | null>(null);
  const [editingActualItemId, setEditingActualItemId] = useState<string | null>(null);
  const [editActualHours, setEditActualHours] = useState(0);
  const [editActualNotes, setEditActualNotes] = useState("");
  const [showNotes, setShowNotes] = useState<Set<string>>(new Set());
```

- [ ] **Step 4: Add handler functions**

After the existing `handleDeleteScopeItem` handler, add:

```typescript
  async function handleMarkDelivered() {
    await updateProject(projectId, { status: "delivered" });
    setProject((prev: any) => ({ ...prev, status: "delivered" }));
    setPhase("delivered");
    // Load the accuracy report
    const r = await getAccuracyReport(projectId);
    setReport(r);
  }

  async function handleLogActual(scopeItemId: string) {
    if (editActualHours <= 0) return;
    try {
      await logActual(scopeItemId, editActualHours, editActualNotes || undefined);
      // Refresh report
      const r = await getAccuracyReport(projectId);
      setReport(r);
      setEditingActualItemId(null);
      setEditActualHours(0);
      setEditActualNotes("");
    } catch (e: any) {
      // If 409 (already exists), try update instead
      if (e.message?.includes("already logged")) {
        const item = report?.phases.flatMap((p) => p.items).find((i) => i.id === scopeItemId);
        if (item?.actualId) {
          await updateActual(item.actualId, { actualHours: editActualHours, notes: editActualNotes || undefined });
          const r = await getAccuracyReport(projectId);
          setReport(r);
          setEditingActualItemId(null);
          setEditActualHours(0);
          setEditActualNotes("");
        }
      }
    }
  }

  function varianceColor(variance: number | null): string {
    if (variance === null) return "";
    const abs = Math.abs(variance);
    if (abs <= 10) return "text-green-600";
    if (abs <= 30) return "text-yellow-600";
    return "text-red-600";
  }

  function varianceBgColor(variance: number | null): string {
    if (variance === null) return "bg-gray-100";
    const abs = Math.abs(variance);
    if (abs <= 10) return "bg-green-100";
    if (abs <= 30) return "bg-yellow-100";
    return "bg-red-100";
  }
```

- [ ] **Step 5: Load report when phase is "delivered" on mount**

In the useEffect that restores phase from server status (the one modified in Task 4), after `setPhase("delivered")`, add:

```typescript
          if (p.status === "delivered") {
            setPhase("delivered");
            const r = await getAccuracyReport(projectId);
            setReport(r);
          }
```

(Replace the existing `setPhase("delivered")` line with both lines.)

- [ ] **Step 6: Add "Mark as Delivered" button**

In the JSX, after the "Generate Proposal" section (after the closing `)}` of `{phase === "complete" && (` around line 1174), add:

```tsx
            {/* Mark as Delivered */}
            {phase === "complete" && (
              <div className="border-t border-sand/30 pt-4 mt-4">
                <button
                  onClick={handleMarkDelivered}
                  className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 transition"
                >
                  Mark as Delivered
                </button>
                <p className="text-xs text-gray-400 mt-2 text-center">
                  Unlocks actuals tracking to compare estimates vs. reality
                </p>
              </div>
            )}
```

- [ ] **Step 7: Add the actuals entry + accuracy report UI for delivered phase**

After the "Mark as Delivered" section, add:

```tsx
            {/* Actuals Tracking */}
            {phase === "delivered" && report && (
              <div>
                <h2 className="font-bold text-forest mb-4">Actuals vs. Estimates</h2>

                {/* Project summary */}
                <div className="mb-6 p-4 rounded-lg border-2 border-forest/20 bg-forest/5">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Estimated</div>
                      <div className="text-lg font-semibold">{report.project.totalEstimated}h</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Actual</div>
                      <div className="text-lg font-semibold">
                        {report.project.totalActual !== null ? `${report.project.totalActual}h` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Accuracy</div>
                      <div className={`text-lg font-semibold ${report.project.accuracyScore !== null ? (report.project.accuracyScore >= 70 ? "text-green-600" : report.project.accuracyScore >= 40 ? "text-yellow-600" : "text-red-600") : ""}`}>
                        {report.project.accuracyScore !== null ? `${report.project.accuracyScore}/100` : "—"}
                      </div>
                    </div>
                  </div>
                  {report.project.variancePercent !== null && (
                    <p className="text-sm text-gray-600 text-center mt-3">
                      This project came in {Math.abs(report.project.variancePercent).toFixed(1)}% {report.project.variancePercent > 0 ? "over" : report.project.variancePercent < 0 ? "under" : "right on"} the realistic estimate
                    </p>
                  )}
                </div>

                {/* Per-phase sections */}
                {report.phases.map((phaseData) => (
                  <div key={phaseData.phase} className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900">{phaseData.phase}</h3>
                      {phaseData.totals.variancePercent !== null && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${varianceBgColor(phaseData.totals.variancePercent)} ${varianceColor(phaseData.totals.variancePercent)}`}>
                          {phaseData.totals.variancePercent > 0 ? "+" : ""}{phaseData.totals.variancePercent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {phaseData.items.map((item) => (
                        <div key={item.id}>
                          <div className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-cream/50 group">
                            <span className="text-gray-700 flex-1">{item.deliverable}</span>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span>{item.optimisticHours} — {item.likelyHours} — {item.pessimisticHours}h</span>
                              <span className="text-gray-300">|</span>
                              {item.actualHours !== null ? (
                                <span
                                  className={`font-medium cursor-pointer ${varianceColor(item.variancePercent)}`}
                                  onClick={() => {
                                    setEditingActualItemId(item.id);
                                    setEditActualHours(item.actualHours!);
                                    setEditActualNotes(item.notes ?? "");
                                  }}
                                  title="Click to edit"
                                >
                                  {item.actualHours}h actual ({item.variancePercent! > 0 ? "+" : ""}{item.variancePercent!.toFixed(1)}%)
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingActualItemId(item.id);
                                    setEditActualHours(item.likelyHours);
                                    setEditActualNotes("");
                                  }}
                                  className="text-forest hover:text-forest-light font-medium"
                                >
                                  Log actual
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Inline actual entry/edit */}
                          {editingActualItemId === item.id && (
                            <div className="mx-2 mb-2 p-3 bg-cream/50 rounded-lg border border-sand/50">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="flex-1">
                                  <label className="text-xs text-gray-500 block mb-1">Actual hours</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={editActualHours}
                                    onChange={(e) => setEditActualHours(parseInt(e.target.value) || 0)}
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") handleLogActual(item.id); if (e.key === "Escape") setEditingActualItemId(null); }}
                                    className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                                  />
                                </div>
                                <div className="text-xs text-gray-400 pt-4">
                                  vs. {item.likelyHours}h estimated
                                </div>
                              </div>
                              {showNotes.has(item.id) || editActualNotes ? (
                                <div className="mb-2">
                                  <label className="text-xs text-gray-500 block mb-1">Notes (why over/under?)</label>
                                  <input
                                    value={editActualNotes}
                                    onChange={(e) => setEditActualNotes(e.target.value)}
                                    placeholder="e.g., Extra stakeholder meetings, simpler than expected..."
                                    className="w-full px-2 py-1 text-xs border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                                  />
                                </div>
                              ) : (
                                <button
                                  onClick={() => setShowNotes((prev) => new Set([...prev, item.id]))}
                                  className="text-xs text-gray-400 hover:text-forest mb-2"
                                >
                                  + add note
                                </button>
                              )}
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingActualItemId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                                <button
                                  onClick={() => handleLogActual(item.id)}
                                  disabled={editActualHours <= 0}
                                  className="text-xs text-forest font-medium disabled:opacity-50"
                                >
                                  {item.actualHours !== null ? "Update" : "Save"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-2 px-2 pt-1 border-t border-sand/30">
                      <span className="font-medium">{phaseData.phase} subtotal</span>
                      <span>
                        {phaseData.totals.estimatedLikely}h est.
                        {phaseData.totals.actual !== null && (
                          <span className={`ml-2 font-medium ${varianceColor(phaseData.totals.variancePercent)}`}>
                            {phaseData.totals.actual}h actual
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
```

- [ ] **Step 8: Update left panel for delivered phase**

Find the left panel section that shows the "Scope is solid" message for complete phase (the `{phase === "complete" && (` block in the left panel). After it, add:

```tsx
              {phase === "delivered" && (
                <div className="bg-gray-800/10 rounded-lg p-4 text-center">
                  <p className="font-medium text-gray-800">Project Delivered</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Log actual hours per deliverable to track estimate accuracy.
                  </p>
                </div>
              )}
```

- [ ] **Step 9: Verify TypeScript compilation**

```bash
cd /Users/ryanhaugland/scoper && npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/project/[id]/page.tsx
git commit -m "feat: actuals entry UI with live accuracy report"
```

---

### Task 6: Status validation — Restrict "delivered" transition

**Files:**
- Modify: `apps/api/src/routes/projects.ts:52-87` (PATCH route)

- [ ] **Step 1: Add status transition validation to the project update route**

In `apps/api/src/routes/projects.ts`, after the ownership check (after line 70), before the update query, add validation:

```typescript
  // Validate status transitions
  if (status) {
    const validTransitions: Record<string, string[]> = {
      draft: ["scoping"],
      scoping: ["complete"],
      complete: ["delivered", "proposal_sent"],
      proposal_sent: ["delivered"],
      delivered: [],
    };
    const allowed = validTransitions[existing.status] ?? [];
    if (!allowed.includes(status)) {
      return c.json({ error: `Cannot transition from "${existing.status}" to "${status}"` }, 400);
    }
  }
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/ryanhaugland/scoper && npx tsc --noEmit -p apps/api/tsconfig.json
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/projects.ts
git commit -m "feat: validate project status transitions"
```

---

## Self-Review Checklist

- **Spec coverage:** Schema changes (Task 1), API routes (Task 2), API client (Task 3), state restoration (Task 4), frontend UI with actuals entry + report (Task 5), status validation (Task 6). All spec sections covered.
- **Placeholder scan:** No TBDs, TODOs, or vague instructions. All code blocks are complete.
- **Type consistency:** `ActualEntry` interface matches the report API shape. `variancePercent`, `accuracyScore`, `actualHours` types are consistent across API response, interface, and UI. `handleLogActual` handles both create (POST) and update (PATCH via 409 fallback). `listScopes` added in both API and client.
