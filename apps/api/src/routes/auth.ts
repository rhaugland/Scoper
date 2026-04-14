import { Hono } from "hono";
import { createMagicLink, verifyMagicLink } from "../services/magic-link";
import { setCookie, getCookie } from "hono/cookie";

const auth = new Hono();

auth.post("/send-magic-link", async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  if (!email || !email.includes("@")) {
    return c.json({ error: "Valid email required" }, 400);
  }
  await createMagicLink(email);
  return c.json({ ok: true });
});

auth.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Token required" }, 400);

  const result = await verifyMagicLink(token);
  if (!result) return c.json({ error: "Invalid or expired token" }, 401);

  setCookie(c, "session", result.userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return c.json({ userId: result.userId });
});

auth.get("/me", async (c) => {
  const userId = getCookie(c, "session");
  if (!userId) return c.json({ error: "Not authenticated" }, 401);
  return c.json({ userId });
});

export default auth;
