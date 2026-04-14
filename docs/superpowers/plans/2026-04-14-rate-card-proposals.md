# Rate Card & Proposal Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-project rate configuration and one-click AI-generated PDF proposal download to Scoper.

**Architecture:** Three new columns on `projects` table for rate config. New `proposals` table for history. New Claude prompt generates proposal markdown from scope state + rates. Puppeteer renders styled HTML to PDF. Frontend adds rate config UI to right panel and a "Generate Proposal" button.

**Tech Stack:** Drizzle ORM (migration), Hono (API routes), Puppeteer (PDF), Claude API (proposal text), React/Next.js (UI)

---

### Task 1: Database Migration — Add Rate Columns to Projects

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: migration via `drizzle-kit generate`

- [ ] **Step 1: Add rate columns to projects schema**

In `packages/db/src/schema.ts`, add three columns to the `projects` table:

```typescript
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  clientName: varchar("client_name", { length: 255 }),
  status: projectStatusEnum("status").default("draft").notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  blendedRate: integer("blended_rate"),           // cents per hour
  marginPercent: integer("margin_percent"),         // optional markup %
  weeklyCapacity: integer("weekly_capacity").default(30), // hrs/week for timeline calc
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Generate and run migration**

```bash
cd /Users/ryanhaugland/scoper/packages/db
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/migrations/
git commit -m "feat: add rate config columns to projects table"
```

---

### Task 2: Database — Create Proposals Table

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/index.ts`
- Create: migration via `drizzle-kit generate`

- [ ] **Step 1: Add pricingModeEnum and proposals table to schema**

In `packages/db/src/schema.ts`, add after the `risks` table:

```typescript
export const pricingModeEnum = pgEnum("pricing_mode", [
  "per_phase",
  "retainer",
]);

export const proposals = pgTable("proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  content: text("content").notNull(),
  pricingMode: pricingModeEnum("pricing_mode").default("per_phase").notNull(),
  retainerMonths: integer("retainer_months"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Export proposals from index.ts**

In `packages/db/src/index.ts`, add `proposals` to the exports (follow the existing pattern — it re-exports everything from schema).

- [ ] **Step 3: Generate and run migration**

```bash
cd /Users/ryanhaugland/scoper/packages/db
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/index.ts packages/db/src/migrations/
git commit -m "feat: add proposals table and pricing_mode enum"
```

---

### Task 3: API — Extend Project PATCH for Rate Config

**Files:**
- Modify: `apps/api/src/routes/projects.ts:52-81`

- [ ] **Step 1: Update the PATCH handler to accept rate fields**

Replace the existing PATCH route in `apps/api/src/routes/projects.ts`:

```typescript
// Update a project
projectsRouter.patch("/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const { name, clientName, status, blendedRate, marginPercent, weeklyCapacity } = await c.req.json<{
    name?: string;
    clientName?: string;
    status?: string;
    blendedRate?: number;
    marginPercent?: number;
    weeklyCapacity?: number;
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
      ...(blendedRate !== undefined && { blendedRate }),
      ...(marginPercent !== undefined && { marginPercent }),
      ...(weeklyCapacity !== undefined && { weeklyCapacity }),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, c.req.param("id")))
    .returning();

  return c.json(updated);
});
```

- [ ] **Step 2: Verify the dev server restarts cleanly**

```bash
# Check the API logs in tmux for compilation errors
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/projects.ts
git commit -m "feat: extend project PATCH to accept rate config fields"
```

---

### Task 4: API — Add updateProject to Frontend API Client

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add updateProject function**

In `apps/web/src/lib/api.ts`, add after the `getProject` function:

```typescript
export const updateProject = (id: string, data: {
  name?: string;
  clientName?: string;
  blendedRate?: number;
  marginPercent?: number;
  weeklyCapacity?: number;
}) =>
  request<any>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add updateProject to frontend API client"
```

---

### Task 5: Frontend — Rate Config UI on Right Panel

**Files:**
- Modify: `apps/web/src/app/project/[id]/page.tsx`

- [ ] **Step 1: Add import and state**

Add `updateProject` to the imports from `@/lib/api`.

Add state variables after the existing `editHours` state:

```typescript
const [rateConfig, setRateConfig] = useState({ blendedRate: 0, marginPercent: 0, weeklyCapacity: 30 });
const [editingRate, setEditingRate] = useState(false);
```

- [ ] **Step 2: Initialize rate config from project data**

In the existing `useEffect` that calls `getProject`, update the callback to also set rate config:

```typescript
useEffect(() => {
  getProject(projectId).then((p) => {
    setProject(p);
    setRateConfig({
      blendedRate: p.blendedRate ?? 0,
      marginPercent: p.marginPercent ?? 0,
      weeklyCapacity: p.weeklyCapacity ?? 30,
    });
  }).catch(() => router.push("/dashboard"));
  listInputs(projectId).then(setInputs);
}, [projectId, router]);
```

- [ ] **Step 3: Add rate save handler**

Add after `handleSaveHours`:

```typescript
async function handleSaveRate() {
  await updateProject(projectId, {
    blendedRate: rateConfig.blendedRate,
    marginPercent: rateConfig.marginPercent,
    weeklyCapacity: rateConfig.weeklyCapacity,
  });
  setProject((prev: any) => ({
    ...prev,
    blendedRate: rateConfig.blendedRate,
    marginPercent: rateConfig.marginPercent,
    weeklyCapacity: rateConfig.weeklyCapacity,
  }));
  setEditingRate(false);
}
```

- [ ] **Step 4: Add helper function for price calculation**

Add after `handleSaveRate`:

```typescript
function calcPrice(hours: number): string {
  if (!rateConfig.blendedRate) return "";
  const rate = rateConfig.blendedRate * (1 + (rateConfig.marginPercent || 0) / 100);
  return `$${((hours * rate) / 100).toLocaleString()}`;
}
```

- [ ] **Step 5: Add rate config UI at top of right panel**

In the right panel section, add this block right after `<h2 className="font-bold text-forest mb-4">Scope</h2>`:

```tsx
{/* Rate Config */}
<div className="mb-6 p-3 bg-cream/30 rounded-lg border border-sand/50">
  <div className="flex items-center justify-between mb-2">
    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rate Config</h3>
    {!editingRate ? (
      <button
        onClick={() => setEditingRate(true)}
        className="text-xs text-gray-400 hover:text-forest transition"
      >
        {rateConfig.blendedRate ? "Edit" : "Set rate"}
      </button>
    ) : (
      <div className="flex gap-2">
        <button onClick={() => setEditingRate(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        <button onClick={handleSaveRate} className="text-xs text-forest hover:text-forest-light font-medium">Save</button>
      </div>
    )}
  </div>
  {editingRate ? (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Rate ($/hr)</label>
        <input
          type="number"
          min={0}
          value={rateConfig.blendedRate / 100 || ""}
          onChange={(e) => setRateConfig({ ...rateConfig, blendedRate: Math.round(parseFloat(e.target.value || "0") * 100) })}
          className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
          placeholder="150"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Margin %</label>
        <input
          type="number"
          min={0}
          value={rateConfig.marginPercent || ""}
          onChange={(e) => setRateConfig({ ...rateConfig, marginPercent: parseInt(e.target.value || "0") })}
          className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
          placeholder="0"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Hrs/week</label>
        <input
          type="number"
          min={1}
          value={rateConfig.weeklyCapacity}
          onChange={(e) => setRateConfig({ ...rateConfig, weeklyCapacity: parseInt(e.target.value || "30") })}
          className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
          placeholder="30"
        />
      </div>
    </div>
  ) : rateConfig.blendedRate ? (
    <div className="text-sm text-gray-600">
      ${(rateConfig.blendedRate / 100).toFixed(0)}/hr
      {rateConfig.marginPercent ? ` + ${rateConfig.marginPercent}% margin` : ""}
      {" · "}{rateConfig.weeklyCapacity}hrs/week
    </div>
  ) : (
    <div className="text-sm text-gray-400 italic">No rate set — set to see pricing</div>
  )}
</div>
```

- [ ] **Step 6: Add dollar amounts to phase subtotals**

Update the phase subtotal line (the `div` with `{phaseName} subtotal`) to include pricing:

```tsx
<div className="flex justify-between text-xs text-gray-500 mt-2 px-2 pt-1 border-t border-sand/30">
  <span className="font-medium">{phaseName} subtotal</span>
  <span>
    {phaseOptimistic} — {phaseLikely} — {phasePessimistic}h
    {rateConfig.blendedRate > 0 && (
      <span className="ml-2 text-forest">{calcPrice(phaseOptimistic)} — {calcPrice(phaseLikely)} — {calcPrice(phasePessimistic)}</span>
    )}
  </span>
</div>
```

- [ ] **Step 7: Add dollar amounts to bottom total**

Update the bottom total section. After each hours `div`, add a price row. Replace the entire `border-t-2` total block:

```tsx
{scopeItems.length > 0 && (
  <div className="border-t-2 border-forest/20 pt-4 mb-6">
    <div className="flex justify-between text-sm font-medium mb-1">
      <span>Total estimate</span>
    </div>
    <div className="grid grid-cols-3 gap-4 text-center">
      <div>
        <div className="text-xs text-gray-500 mb-1">Optimistic</div>
        <div className="text-lg font-semibold text-forest">
          {scopeItems.reduce((s, i) => s + i.optimisticHours, 0)}h
        </div>
        {rateConfig.blendedRate > 0 && (
          <div className="text-sm text-gray-600">
            {calcPrice(scopeItems.reduce((s, i) => s + i.optimisticHours, 0))}
          </div>
        )}
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Realistic</div>
        <div className="text-lg font-semibold text-forest">
          {scopeItems.reduce((s, i) => s + i.likelyHours, 0)}h
        </div>
        {rateConfig.blendedRate > 0 && (
          <div className="text-sm text-gray-600">
            {calcPrice(scopeItems.reduce((s, i) => s + i.likelyHours, 0))}
          </div>
        )}
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Pessimistic</div>
        <div className="text-lg font-semibold text-forest">
          {scopeItems.reduce((s, i) => s + i.pessimisticHours, 0)}h
        </div>
        {rateConfig.blendedRate > 0 && (
          <div className="text-sm text-gray-600">
            {calcPrice(scopeItems.reduce((s, i) => s + i.pessimisticHours, 0))}
          </div>
        )}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/project/[id]/page.tsx
git commit -m "feat: add rate config UI and pricing display to scope panel"
```

---

### Task 6: API — Proposal Generation Prompt

**Files:**
- Modify: `apps/api/src/services/ai/prompts.ts`
- Modify: `apps/api/src/services/ai/types.ts`

- [ ] **Step 1: Add ProposalContext type**

In `apps/api/src/services/ai/types.ts`, add at the end:

```typescript
export interface ProposalContext {
  projectName: string;
  clientName: string | null;
  summary: string;
  scopeItems: GeneratedScopeItem[];
  assumptions: GeneratedAssumption[];
  risks: GeneratedRisk[];
  questionsAndAnswers: { question: string; answer: string }[];
  phasePricing: { phase: string; optimistic: string; realistic: string; pessimistic: string }[];
  totalPricing: { optimistic: string; realistic: string; pessimistic: string };
  timeline: { phase: string; weeks: number }[];
  pricingMode: "per_phase" | "retainer";
  retainerMonths?: number;
}
```

- [ ] **Step 2: Add proposal prompt builder**

In `apps/api/src/services/ai/prompts.ts`, add at the end of the file:

```typescript
import type { ProposalContext } from "./types";

export function buildProposalPrompt(ctx: ProposalContext): string {
  const phaseDetails = ctx.scopeItems.reduce((acc, item) => {
    if (!acc[item.phase]) acc[item.phase] = [];
    acc[item.phase].push(item);
    return acc;
  }, {} as Record<string, typeof ctx.scopeItems>);

  const phaseList = Object.entries(phaseDetails)
    .map(([phase, items]) => {
      const deliverables = items.map((i) => `  - ${i.deliverable} (${i.optimisticHours}-${i.pessimisticHours}h)`).join("\n");
      const pricing = ctx.phasePricing.find((p) => p.phase === phase);
      const timeline = ctx.timeline.find((t) => t.phase === phase);
      return `Phase: ${phase}\nDeliverables:\n${deliverables}\nPricing: ${pricing?.realistic ?? "TBD"}\nDuration: ~${timeline?.weeks ?? "?"}  weeks`;
    })
    .join("\n\n");

  const qaSection = ctx.questionsAndAnswers.length > 0
    ? ctx.questionsAndAnswers.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join("\n\n")
    : "No clarifying Q&A.";

  const pricingInstruction = ctx.pricingMode === "retainer"
    ? `Present pricing as a monthly retainer: ${ctx.retainerMonths ?? 3} months at a monthly rate (divide total realistic price by months). Still show the per-phase breakdown as reference.`
    : `Present pricing per phase with a project total. Use the realistic price as the primary figure. Note the optimistic-pessimistic range.`;

  return `You are writing a professional consulting proposal for a software project. Write in a confident, clear, direct consulting tone. No filler. No jargon. Short sentences that inspire client confidence.

PROJECT DETAILS:
- Project: ${ctx.projectName}
- Client: ${ctx.clientName ?? "Not specified"}
- Summary: ${ctx.summary}

PHASED SCOPE:
${phaseList}

ASSUMPTIONS:
${ctx.assumptions.map((a) => `- ${a.content}`).join("\n")}

RISKS:
${ctx.risks.map((r) => `- [${r.severity}] ${r.content}${r.mitigation ? ` (Mitigation: ${r.mitigation})` : ""}`).join("\n")}

SCOPE DECISIONS (from Q&A):
${qaSection}

PRICING:
- Optimistic: ${ctx.totalPricing.optimistic}
- Realistic: ${ctx.totalPricing.realistic}
- Pessimistic: ${ctx.totalPricing.pessimistic}
${pricingInstruction}

Generate a proposal in markdown with these exact section headers (use ## for each):

## Executive Summary
2-3 paragraphs. What we'll build, why it matters to the client, and our approach. Reference specific decisions from Q&A where relevant.

## Phased Deliverables
For each phase: a short paragraph describing what gets done and why, then a bulleted list of deliverables.

## Timeline
A simple table: | Phase | Duration | Start |
Calculate start dates assuming work begins "Week 1". Each phase starts after the previous one ends.

## Pricing
${ctx.pricingMode === "retainer"
    ? "Present as monthly retainer with per-phase reference breakdown."
    : "Per-phase pricing table: | Phase | Investment |. Then a total line. Note the estimate range."}

## Assumptions & Exclusions
Bulleted list. Frame positively — "This proposal assumes..." not "We won't do..."

## Terms
- 50% deposit to begin, 50% on completion
- 2 rounds of revisions included per phase
- Additional work beyond scope at hourly rate
- Weekly status updates included

Do NOT include a cover page — that will be added separately. Do NOT use the word "delve." Keep it under 1500 words.`;
}
```

- [ ] **Step 3: Fix the import**

The import for `ProposalContext` needs to be at the top of `prompts.ts`. Move it to the existing imports:

```typescript
import type { ExtractedDraft, GeneratedScopeItem, GeneratedAssumption, GeneratedRisk, ProposalContext } from "./types";
```

And remove the inline `import type { ProposalContext } from "./types";` from above the function.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/ai/prompts.ts apps/api/src/services/ai/types.ts
git commit -m "feat: add proposal generation prompt and ProposalContext type"
```

---

### Task 7: API — Proposal Generation Service

**Files:**
- Create: `apps/api/src/services/ai/proposal.ts`

- [ ] **Step 1: Create the proposal generation service**

Create `apps/api/src/services/ai/proposal.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { buildProposalPrompt } from "./prompts";
import type { ProposalContext } from "./types";

let _anthropic: Anthropic;
function getClient() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

export async function generateProposalContent(ctx: ProposalContext): Promise<string> {
  const prompt = buildProposalPrompt(ctx);

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return text.text.trim();
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/ai/proposal.ts
git commit -m "feat: add proposal generation service calling Claude API"
```

---

### Task 8: API — PDF Rendering Service

**Files:**
- Create: `apps/api/src/services/pdf.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/ryanhaugland/scoper/apps/api
pnpm add puppeteer marked
```

- [ ] **Step 2: Create the PDF rendering service**

Create `apps/api/src/services/pdf.ts`:

```typescript
import puppeteer from "puppeteer";
import { marked } from "marked";

function buildHTML(markdown: string, projectName: string, clientName: string | null, date: string): string {
  const bodyHtml = marked.parse(markdown) as string;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 60px 50px; size: letter; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a1a;
    max-width: 100%;
  }
  .cover {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100vh;
    text-align: center;
    page-break-after: always;
  }
  .cover h1 {
    font-size: 28pt;
    color: #2d5016;
    margin-bottom: 8px;
    font-weight: 700;
  }
  .cover .client {
    font-size: 16pt;
    color: #666;
    margin-bottom: 40px;
  }
  .cover .date {
    font-size: 11pt;
    color: #999;
  }
  .cover .company {
    font-size: 12pt;
    color: #2d5016;
    margin-top: 60px;
    font-weight: 600;
  }
  h2 {
    font-size: 16pt;
    color: #2d5016;
    border-bottom: 2px solid #2d501620;
    padding-bottom: 6px;
    margin-top: 30px;
    page-break-after: avoid;
  }
  h3 {
    font-size: 13pt;
    color: #333;
    margin-top: 20px;
  }
  p { margin: 8px 0; }
  ul { padding-left: 20px; }
  li { margin: 4px 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 10pt;
  }
  th {
    background: #2d501610;
    color: #2d5016;
    text-align: left;
    padding: 8px 12px;
    font-weight: 600;
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid #eee;
  }
  tr:nth-child(even) td { background: #fafaf8; }
  strong { color: #2d5016; }
  .footer {
    position: fixed;
    bottom: 20px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 8pt;
    color: #ccc;
  }
</style>
</head>
<body>
  <div class="cover">
    <h1>${projectName}</h1>
    ${clientName ? `<div class="client">Prepared for ${clientName}</div>` : ""}
    <div class="date">${date}</div>
    <div class="company">w3</div>
  </div>
  ${bodyHtml}
</body>
</html>`;
}

export async function renderProposalPDF(
  markdown: string,
  projectName: string,
  clientName: string | null
): Promise<Buffer> {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = buildHTML(markdown, projectName, clientName, date);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "60px", bottom: "60px", left: "50px", right: "50px" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/pdf.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat: add PDF rendering service with Puppeteer and styled HTML template"
```

---

### Task 9: API — Proposal Route

**Files:**
- Create: `apps/api/src/routes/proposals.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create the proposals route**

Create `apps/api/src/routes/proposals.ts`:

```typescript
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

  return new Response(pdf, {
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
```

- [ ] **Step 2: Mount the route in index.ts**

In `apps/api/src/index.ts`, add the import and route:

```typescript
import proposalsRouter from "./routes/proposals";
```

Add after the export route:

```typescript
app.route("/api/proposals", proposalsRouter);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/proposals.ts apps/api/src/index.ts
git commit -m "feat: add proposal generation route with PDF download"
```

---

### Task 10: Frontend — Generate Proposal Button and Download

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/project/[id]/page.tsx`

- [ ] **Step 1: Add generateProposal to API client**

In `apps/web/src/lib/api.ts`, add after the `updateProject` function:

```typescript
export async function generateProposal(
  projectId: string,
  pricingMode: "per_phase" | "retainer" = "per_phase",
  retainerMonths?: number
): Promise<Blob> {
  const res = await fetch(`/api/proposals/${projectId}/generate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pricingMode, retainerMonths }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.blob();
}
```

- [ ] **Step 2: Add state and import to project page**

In `apps/web/src/app/project/[id]/page.tsx`, add `generateProposal` to the imports from `@/lib/api`.

Add state after `editingRate`:

```typescript
const [generatingProposal, setGeneratingProposal] = useState(false);
const [proposalPricingMode, setProposalPricingMode] = useState<"per_phase" | "retainer">("per_phase");
const [retainerMonths, setRetainerMonths] = useState(3);
const [showProposalOptions, setShowProposalOptions] = useState(false);
```

- [ ] **Step 3: Add proposal generation handler**

Add after `handleSaveRate`:

```typescript
async function handleGenerateProposal() {
  setGeneratingProposal(true);
  try {
    const blob = await generateProposal(projectId, proposalPricingMode, proposalPricingMode === "retainer" ? retainerMonths : undefined);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name ?? "proposal"}-proposal.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowProposalOptions(false);
  } catch (e: any) {
    console.error("Proposal generation failed:", e);
    alert(e.message || "Failed to generate proposal");
  } finally {
    setGeneratingProposal(false);
  }
}
```

- [ ] **Step 4: Add Generate Proposal UI at bottom of right panel**

At the very end of the right panel (after the risks section, before the closing `</div>` of the right panel), add:

```tsx
{/* Generate Proposal */}
{phase === "complete" && (
  <div className="border-t-2 border-forest/20 pt-4 mt-6">
    {!showProposalOptions ? (
      <button
        onClick={() => setShowProposalOptions(true)}
        disabled={!rateConfig.blendedRate}
        className="w-full px-4 py-3 bg-forest text-white rounded-lg font-medium hover:bg-forest-light transition disabled:opacity-50"
      >
        {rateConfig.blendedRate ? "Generate Proposal" : "Set rate to generate proposal"}
      </button>
    ) : (
      <div className="space-y-3">
        <h3 className="font-medium text-gray-900">Proposal Options</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setProposalPricingMode("per_phase")}
            className={`flex-1 px-3 py-2 rounded text-sm border transition ${
              proposalPricingMode === "per_phase"
                ? "border-forest bg-forest/10 text-forest"
                : "border-sand text-gray-600 hover:border-forest/30"
            }`}
          >
            Per phase
          </button>
          <button
            onClick={() => setProposalPricingMode("retainer")}
            className={`flex-1 px-3 py-2 rounded text-sm border transition ${
              proposalPricingMode === "retainer"
                ? "border-forest bg-forest/10 text-forest"
                : "border-sand text-gray-600 hover:border-forest/30"
            }`}
          >
            Monthly retainer
          </button>
        </div>
        {proposalPricingMode === "retainer" && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Number of months</label>
            <input
              type="number"
              min={1}
              value={retainerMonths}
              onChange={(e) => setRetainerMonths(parseInt(e.target.value) || 3)}
              className="w-20 px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
            />
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setShowProposalOptions(false)}
            className="flex-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerateProposal}
            disabled={generatingProposal}
            className="flex-1 px-4 py-2 bg-forest text-white rounded-lg text-sm font-medium hover:bg-forest-light transition disabled:opacity-50"
          >
            {generatingProposal ? "Generating..." : "Download PDF"}
          </button>
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app/project/[id]/page.tsx
git commit -m "feat: add generate proposal button with pricing mode options and PDF download"
```

---

### Task 11: End-to-End Verification

- [ ] **Step 1: Restart dev servers**

```bash
# In the tmux scoper session, Ctrl-C then:
pnpm dev
```

- [ ] **Step 2: Test the full flow**

1. Navigate to an existing project (the TechFlow Dashboard demo)
2. Verify the rate config section appears in the right panel
3. Set a blended rate (e.g., $150/hr = enter 150)
4. Verify dollar amounts appear next to phase subtotals and bottom total
5. If scope is not complete, use "Answer all & finish" to complete it
6. Click "Generate Proposal"
7. Select "Per phase" pricing
8. Click "Download PDF"
9. Verify the PDF downloads and contains all sections: cover page, executive summary, deliverables, timeline, pricing, assumptions, terms

- [ ] **Step 3: Test retainer mode**

1. Click "Generate Proposal" again
2. Select "Monthly retainer" and set 3 months
3. Click "Download PDF"
4. Verify the pricing section shows monthly retainer framing

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: end-to-end verification fixes for rate card and proposals"
```
