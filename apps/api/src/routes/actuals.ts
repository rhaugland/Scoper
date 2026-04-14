import { Hono } from "hono";
import { eq, and, asc } from "drizzle-orm";
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
    .where(eq(scopeItems.scopeId, scope.id))
    .orderBy(asc(scopeItems.sortOrder));

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
    const variancePercent = estimatedLikely > 0 && loggedItems.length > 0 ? ((actual - estimatedLikely) / estimatedLikely) * 100 : null;

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
        variancePercent: variancePercent !== null ? Math.round(variancePercent * 10) / 10 : null,
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
