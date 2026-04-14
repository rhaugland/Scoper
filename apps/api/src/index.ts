import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import auth from "./routes/auth";
import projectsRouter from "./routes/projects";
import inputsRouter from "./routes/inputs";
import scopingRouter from "./routes/scoping";
import exportRouter from "./routes/export";

const app = new Hono();

app.use("*", cors({
  origin: process.env.APP_URL ?? "http://localhost:3002",
  credentials: true,
}));

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/auth", auth);
app.route("/api/projects", projectsRouter);
app.route("/api/projects", inputsRouter);
app.route("/api/scoping", scopingRouter);
app.route("/api/export", exportRouter);

if (process.env.NODE_ENV !== "test") {
  const port = parseInt(process.env.PORT ?? "3001");
  console.log(`Scoper API running on port ${port}`);
  serve({ fetch: app.fetch, port });
}

export default app;
