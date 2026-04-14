import { Hono } from "hono";
import { db, projects, scopes } from "@scoper/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const projectsRouter = new Hono();
projectsRouter.use("*", requireAuth);

// List all projects for user
projectsRouter.get("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.createdBy, userId))
    .orderBy(desc(projects.updatedAt));
  return c.json(rows);
});

// Create a project
projectsRouter.post("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const { name, clientName } = await c.req.json<{ name: string; clientName?: string }>();
  if (!name) return c.json({ error: "Name required" }, 400);

  const [project] = await db
    .insert(projects)
    .values({ name, clientName, createdBy: userId })
    .returning();

  // Create initial scope
  await db.insert(scopes).values({ projectId: project.id, version: 1 });

  return c.json(project, 201);
});

// Get a project
projectsRouter.get("/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, c.req.param("id")));

  if (!project || project.createdBy !== userId) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(project);
});

// Update a project
projectsRouter.patch("/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const { name, clientName, status } = await c.req.json<{
    name?: string;
    clientName?: string;
    status?: string;
  }>();

  const [existing] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, c.req.param("id")));

  if (!existing || existing.createdBy !== userId) {
    return c.json({ error: "Not found" }, 404);
  }

  const [updated] = await db
    .update(projects)
    .set({
      ...(name && { name }),
      ...(clientName !== undefined && { clientName }),
      ...(status && { status: status as any }),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, c.req.param("id")))
    .returning();

  return c.json(updated);
});

// Delete a project
projectsRouter.delete("/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const [existing] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, c.req.param("id")));

  if (!existing || existing.createdBy !== userId) {
    return c.json({ error: "Not found" }, 404);
  }

  await db.delete(projects).where(eq(projects.id, c.req.param("id")));
  return c.json({ ok: true });
});

export default projectsRouter;
