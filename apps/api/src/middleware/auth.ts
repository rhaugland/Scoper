import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";

export const requireAuth = createMiddleware(async (c, next) => {
  const session = getCookie(c, "session");
  if (!session) {
    return c.json({ error: "Not authenticated" }, 401);
  }
  c.set("userId" as never, session as never);
  await next();
});
