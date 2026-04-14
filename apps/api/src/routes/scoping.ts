import { Hono } from "hono";
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

export default scopingRouter;
