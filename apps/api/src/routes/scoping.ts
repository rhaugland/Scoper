import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { db, scopeItems, questions, scopes, projects, assumptions, risks } from "@scoper/db";
import { requireAuth } from "../middleware/auth";
import { startScopingSession, answerQuestion, getCurrentScopeState } from "../services/scope-builder";

const scopingRouter = new Hono();
scopingRouter.use("*", requireAuth);

// Start a scoping session
scopingRouter.post("/:projectId/start", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const result = await startScopingSession(projectId);
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Get current scope state
scopingRouter.get("/:scopeId/state", async (c) => {
  const scopeId = c.req.param("scopeId");
  try {
    const state = await getCurrentScopeState(scopeId);
    if (!state.scope) return c.json({ error: "Scope not found" }, 404);
    return c.json(state);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Answer a question
scopingRouter.post("/questions/:questionId/answer", async (c) => {
  const questionId = c.req.param("questionId");
  const { answer, skipped } = await c.req.json<{ answer?: string; skipped?: boolean }>();

  try {
    const result = await answerQuestion(questionId, answer ?? null, skipped ?? false);
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Bulk-answer all unanswered questions and mark scope complete
scopingRouter.post("/:scopeId/complete", async (c) => {
  const scopeId = c.req.param("scopeId");
  const { answers } = await c.req.json<{ answers: { questionId: string; answer: string }[] }>();

  try {
    // Bulk update all provided answers
    for (const a of answers) {
      await db
        .update(questions)
        .set({ answer: a.answer, answeredAt: new Date() })
        .where(eq(questions.id, a.questionId));
    }

    // Skip any remaining unanswered questions
    await db
      .update(questions)
      .set({ skipped: true, answeredAt: new Date() })
      .where(and(eq(questions.scopeId, scopeId), isNull(questions.answeredAt)));

    // Mark project complete
    const [scope] = await db.select().from(scopes).where(eq(scopes.id, scopeId));
    if (scope) {
      await db
        .update(projects)
        .set({ status: "complete", updatedAt: new Date() })
        .where(eq(projects.id, scope.projectId));
    }

    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Update a scope item's hours
scopingRouter.patch("/items/:itemId", async (c) => {
  const itemId = c.req.param("itemId");
  const body = await c.req.json<{
    optimisticHours?: number;
    likelyHours?: number;
    pessimisticHours?: number;
  }>();

  try {
    const [updated] = await db
      .update(scopeItems)
      .set(body)
      .where(eq(scopeItems.id, itemId))
      .returning();

    if (!updated) return c.json({ error: "Scope item not found" }, 404);
    return c.json(updated);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Add an assumption
scopingRouter.post("/assumptions", async (c) => {
  const { scopeId, content, status } = await c.req.json<{
    scopeId: string;
    content: string;
    status?: string;
  }>();
  try {
    const [created] = await db
      .insert(assumptions)
      .values({ scopeId, content, status: (status as any) ?? "unresolved" })
      .returning();
    return c.json(created, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Update an assumption
scopingRouter.patch("/assumptions/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ content?: string; status?: string }>();
  try {
    const [updated] = await db
      .update(assumptions)
      .set({
        ...(body.content !== undefined && { content: body.content }),
        ...(body.status !== undefined && { status: body.status as any }),
      })
      .where(eq(assumptions.id, id))
      .returning();
    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json(updated);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Delete an assumption
scopingRouter.delete("/assumptions/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(assumptions).where(eq(assumptions.id, id));
  return c.json({ ok: true });
});

// Add a risk
scopingRouter.post("/risks", async (c) => {
  const { scopeId, content, severity, mitigation } = await c.req.json<{
    scopeId: string;
    content: string;
    severity: string;
    mitigation?: string;
  }>();
  try {
    const [created] = await db
      .insert(risks)
      .values({ scopeId, content, severity: severity as any, mitigation: mitigation ?? null })
      .returning();
    return c.json(created, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Update a risk
scopingRouter.patch("/risks/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ content?: string; severity?: string; mitigation?: string }>();
  try {
    const [updated] = await db
      .update(risks)
      .set({
        ...(body.content !== undefined && { content: body.content }),
        ...(body.severity !== undefined && { severity: body.severity as any }),
        ...(body.mitigation !== undefined && { mitigation: body.mitigation }),
      })
      .where(eq(risks.id, id))
      .returning();
    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json(updated);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Delete a risk
scopingRouter.delete("/risks/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(risks).where(eq(risks.id, id));
  return c.json({ ok: true });
});

export default scopingRouter;
