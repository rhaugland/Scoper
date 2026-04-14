import type { ExtractedDraft, GeneratedScopeItem, GeneratedAssumption, GeneratedRisk, ProposalContext } from "./types";

export function buildExtractionPrompt(rawInputs: string[]): string {
  const combined = rawInputs.map((input, i) => `--- Input ${i + 1} ---\n${input}`).join("\n\n");

  return `You are a senior software consultant who has scoped hundreds of projects. You are analyzing raw client input to extract a structured project scope.

Analyze the following raw input(s) from a client engagement and extract:

1. **Project type** — what kind of project is this? (web app, mobile app, integration, migration, API, etc.)
2. **Summary** — 2-3 sentence overview of what the client wants
3. **Stated requirements** — things the client explicitly asked for
4. **Implied requirements** — things not stated but clearly necessary (e.g., if they want a web app, they need hosting)
5. **Stakeholders** — anyone mentioned by name or role
6. **Constraints** — budget, timeline, technical constraints mentioned
7. **Timeline references** — any dates, deadlines, or urgency signals

Then produce an initial scope breakdown:
- Break the project into phases
- List deliverables per phase
- Estimate effort in hours (optimistic / likely / pessimistic)
- Rate your confidence 1-100 for each estimate
- List assumptions you're making
- Flag risks with severity (low/medium/high) and potential mitigation

Respond with valid JSON matching this structure:
{
  "draft": {
    "projectType": string | null,
    "summary": string,
    "statedRequirements": string[],
    "impliedRequirements": string[],
    "stakeholders": string[],
    "constraints": string[],
    "timelineReferences": string[]
  },
  "scopeItems": [
    {
      "phase": string,
      "deliverable": string,
      "optimisticHours": number,
      "likelyHours": number,
      "pessimisticHours": number,
      "confidence": number
    }
  ],
  "assumptions": [{ "content": string }],
  "risks": [{ "content": string, "severity": "low"|"medium"|"high", "mitigation": string|null }]
}

RAW CLIENT INPUT:
${combined}`;
}

export function buildInterrogationPrompt(
  draft: ExtractedDraft,
  scopeItems: GeneratedScopeItem[],
  assumptions: GeneratedAssumption[],
  risks: GeneratedRisk[],
  previousQA: { question: string; answer: string | null }[]
): string {
  const answeredCount = previousQA.filter((qa) => qa.answer && qa.answer !== "(skipped)").length;
  const qaHistory = previousQA.length > 0
    ? previousQA.map((qa) =>
        `Q: ${qa.question}\nA: ${qa.answer ?? "(skipped)"}`
      ).join("\n\n")
    : "No previous questions yet.";

  return `You are a senior software consultant reviewing a project scope for gaps, risks, and hidden assumptions. Your job is to ask the MOST IMPORTANT questions that will clarify the scope and prevent costly surprises.

CURRENT SCOPE STATE:
- Project type: ${draft.projectType ?? "Unknown"}
- Summary: ${draft.summary}
- Stated requirements: ${JSON.stringify(draft.statedRequirements)}
- Implied requirements: ${JSON.stringify(draft.impliedRequirements)}
- Scope items: ${JSON.stringify(scopeItems)}
- Assumptions: ${JSON.stringify(assumptions)}
- Risks: ${JSON.stringify(risks)}

PREVIOUS Q&A (${answeredCount} answered so far):
${qaHistory}

CRITICAL RULES:
- Do NOT re-ask questions that have already been answered. If a previous answer addresses a topic, that topic is resolved — move on.
- Do NOT ask follow-up questions to clarify previous answers. Accept answers at face value.
- Each round should cover NEW gaps only — never revisit answered territory.
- When an answer is vague or general, treat it as "use standard/default approach" and mark that area as resolved.
${answeredCount >= 3 ? "\n- You have asked enough questions. Unless there is a CRITICAL gap that would make the project fail, return an empty questions array and mark the scope as complete." : ""}
${answeredCount >= 6 ? "\n- STOP. Return an empty questions array. The scope is complete." : ""}

Analyze the scope for genuinely unaddressed gaps:
1. **Vagueness** — requirements using fuzzy language ("a few," "simple," "basic")
2. **Missing categories** — no mention of auth, hosting, data migration, testing, deployment, etc.
3. **Implicit assumptions** — things the client probably expects but didn't say
4. **Complexity signals** — red flags like "real-time," "integrations," "legacy system"

Generate at most 2 NEW questions (not follow-ups), prioritized by:
- Scope impact (how much could the estimate change based on the answer?)
- Risk (how likely is this to cause a blowup?)
- Mark whether the team can answer this or it needs to go back to the client

Only ask questions that would materially change the scope or estimate. Do NOT pad with low-impact questions.

Also: if previous answers change the scope, provide updated scope items, new assumptions, or new risks.

If the scope is solid and no more high-impact questions remain, return an empty questions array.

Respond with valid JSON:
{
  "questions": [
    {
      "content": string,
      "scopeImpact": "low"|"medium"|"high",
      "riskLevel": "low"|"medium"|"high",
      "forClient": boolean
    }
  ],
  "updatedScopeItems": [...] | null,
  "newAssumptions": [{ "content": string }],
  "newRisks": [{ "content": string, "severity": "low"|"medium"|"high", "mitigation": string|null }]
}`;
}

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
      return `Phase: ${phase}\nDeliverables:\n${deliverables}\nPricing: ${pricing?.realistic ?? "TBD"}\nDuration: ~${timeline?.weeks ?? "?"} weeks`;
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
