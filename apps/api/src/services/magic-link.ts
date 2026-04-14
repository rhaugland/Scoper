import { randomBytes } from "crypto";
import { db, magicLinks, users } from "@scoper/db";
import { eq, and } from "drizzle-orm";
import { Resend } from "resend";

let _resend: Resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function isTokenExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

export async function createMagicLink(email: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db.insert(magicLinks).values({ token, email, expiresAt });

  const link = `${process.env.APP_URL}/login?token=${token}`;

  await getResend().emails.send({
    from: process.env.MAGIC_LINK_FROM_EMAIL!,
    to: email,
    subject: "Sign in to Scoper",
    html: `<p>Click to sign in:</p><p><a href="${link}">${link}</a></p><p>Expires in 15 minutes.</p>`,
  });

  return token;
}

export async function verifyMagicLink(token: string): Promise<{ userId: string } | null> {
  const [link] = await db
    .select()
    .from(magicLinks)
    .where(and(eq(magicLinks.token, token), eq(magicLinks.used, false)));

  if (!link || isTokenExpired(link.expiresAt)) return null;

  await db.update(magicLinks).set({ used: true }).where(eq(magicLinks.id, link.id));

  // Find or create user
  let [user] = await db.select().from(users).where(eq(users.email, link.email));
  if (!user) {
    [user] = await db.insert(users).values({ email: link.email }).returning();
  }

  return { userId: user.id };
}
