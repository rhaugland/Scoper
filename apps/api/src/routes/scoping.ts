import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { db, scopeItems, questions, scopes, projects } from "@scoper/db";
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

export default scopingRouter;
