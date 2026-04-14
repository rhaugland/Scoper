import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import auth from "./routes/auth";

const app = new Hono();

app.use("*", cors({
  origin: process.env.APP_URL ?? "http://localhost:3002",
  credentials: true,
}));

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/auth", auth);

const port = parseInt(process.env.PORT ?? "3001");
console.log(`Scoper API running on port ${port}`);
serve({ fetch: app.fetch, port });

export default app;
