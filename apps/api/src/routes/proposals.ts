import { Hono } from "hono";
import { db, projects, proposals, scopes } from "@scoper/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { getCurrentScopeState } from "../services/scope-builder";
import { generateProposalContent } from "../services/ai/proposal";
import { renderProposalPDF } from "../services/pdf";
import type { ProposalContext } from "../services/ai/types";

const proposalsRouter = new Hono();
proposalsRouter.use("*", requireAuth);

proposalsRouter.post("/:projectId/generate", async (c) => {
  const userId = c.get("userId" as never) as string;
  const projectId = c.req.param("projectId");
  const { pricingMode, retainerMonths } = await c.req.json<{
    pricingMode?: "per_phase" | "retainer";
    retainerMonths?: number;
  }>();

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.createdBy, userId)));

  if (!project) return c.json({ error: "Not found" }, 404);
  if (!project.blendedRate) return c.json({ error: "Set a blended rate before generating a proposal" }, 400);

  const [scope] = await db
    .select()
    .from(scopes)
    .where(and(eq(scopes.projectId, projectId), eq(scopes.isActive, true)));

  if (!scope) return c.json({ error: "No active scope" }, 404);

  const state = await getCurrentScopeState(scope.id);
  const rate = project.blendedRate * (1 + (project.marginPercent || 0) / 100);

  // Build phase pricing
  const phaseMap = new Map<string, typeof state.scopeItems>();
  for (const item of state.scopeItems) {
    const existing = phaseMap.get(item.phase) ?? [];
    existing.push(item);
    phaseMap.set(item.phase, existing);
  }

  const formatPrice = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const phasePricing = Array.from(phaseMap).map(([phase, items]) => ({
    phase,
    optimistic: formatPrice(items.reduce((s, i) => s + i.optimisticHours, 0) * rate),
    realistic: formatPrice(items.reduce((s, i) => s + i.likelyHours, 0) * rate),
    pessimistic: formatPrice(items.reduce((s, i) => s + i.pessimisticHours, 0) * rate),
  }));

  const totalOpt = state.scopeItems.reduce((s, i) => s + i.optimisticHours, 0);
  const totalLikely = state.scopeItems.reduce((s, i) => s + i.likelyHours, 0);
  const totalPess = state.scopeItems.reduce((s, i) => s + i.pessimisticHours, 0);

  const capacity = project.weeklyCapacity ?? 30;
  const timeline = Array.from(phaseMap).map(([phase, items]) => ({
    phase,
    weeks: Math.max(1, Math.round(items.reduce((s, i) => s + i.likelyHours, 0) / capacity)),
  }));

  const questionsAndAnswers = state.questions
    .filter((q: any) => q.answer)
    .map((q: any) => ({ question: q.content, answer: q.answer }));

  const ctx: ProposalContext = {
    projectName: project.name,
    clientName: project.clientName,
    summary: state.draft.summary,
    scopeItems: state.scopeItems,
    assumptions: state.assumptions.map((a: any) => ({ content: a.content })),
    risks: state.risks.map((r: any) => ({ content: r.content, severity: r.severity, mitigation: r.mitigation })),
    questionsAndAnswers,
    phasePricing,
    totalPricing: {
      optimistic: formatPrice(totalOpt * rate),
      realistic: formatPrice(totalLikely * rate),
      pessimistic: formatPrice(totalPess * rate),
    },
    timeline,
    pricingMode: pricingMode ?? "per_phase",
    retainerMonths,
  };

  const markdown = await generateProposalContent(ctx);
  const pdf = await renderProposalPDF(markdown, project.name, project.clientName);

  // Store proposal
  await db.insert(proposals).values({
    projectId,
    content: markdown,
    pricingMode: pricingMode ?? "per_phase",
    retainerMonths: retainerMonths ?? null,
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${project.name.replace(/[^a-zA-Z0-9 ]/g, "")}-proposal.pdf"`,
    },
  });
});

proposalsRouter.get("/:projectId/list", async (c) => {
  const userId = c.get("userId" as never) as string;
  const projectId = c.req.param("projectId");

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.createdBy, userId)));

  if (!project) return c.json({ error: "Not found" }, 404);

  const rows = await db
    .select()
    .from(proposals)
    .where(eq(proposals.projectId, projectId))
    .orderBy(desc(proposals.createdAt));

  return c.json(rows);
});

export default proposalsRouter;
