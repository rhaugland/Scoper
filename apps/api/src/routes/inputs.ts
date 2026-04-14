import { Hono } from "hono";
import { db, inputs, projects } from "@scoper/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const inputsRouter = new Hono();
inputsRouter.use("*", requireAuth);

// List inputs for a project
inputsRouter.get("/:projectId/inputs", async (c) => {
  const userId = c.get("userId" as never) as string;
  const projectId = c.req.param("projectId");

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.createdBy, userId)));

  if (!project) return c.json({ error: "Not found" }, 404);

  const rows = await db
    .select()
    .from(inputs)
    .where(eq(inputs.projectId, projectId));

  return c.json(rows);
});

// Add an input
inputsRouter.post("/:projectId/inputs", async (c) => {
  const userId = c.get("userId" as never) as string;
  const projectId = c.req.param("projectId");

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.createdBy, userId)));

  if (!project) return c.json({ error: "Not found" }, 404);

  const { content, source } = await c.req.json<{ content: string; source?: string }>();
  if (!content) return c.json({ error: "Content required" }, 400);

  const [input] = await db
    .insert(inputs)
    .values({
      projectId,
      content,
      source: (source as any) ?? "other",
    })
    .returning();

  return c.json(input, 201);
});

export default inputsRouter;
