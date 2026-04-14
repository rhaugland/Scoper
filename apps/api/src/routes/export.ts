import { Hono } from "hono";
import { db, projects, scopes } from "@scoper/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { getCurrentScopeState } from "../services/scope-builder";
import { scopeToMarkdown, scopeToQuestionList } from "../services/export";

const exportRouter = new Hono();
exportRouter.use("*", requireAuth);

exportRouter.get("/:projectId/markdown", async (c) => {
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

  const state = await getCurrentScopeState(scope.id);
  const markdown = scopeToMarkdown(state as any, project.name, project.clientName);

  return c.text(markdown, 200, { "Content-Type": "text/plain; charset=utf-8" });
});

exportRouter.get("/:projectId/questions", async (c) => {
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

  const state = await getCurrentScopeState(scope.id);
  const questionList = scopeToQuestionList(state as any);

  return c.text(questionList, 200, { "Content-Type": "text/plain" });
});

export default exportRouter;
