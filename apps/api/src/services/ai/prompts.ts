import type { ExtractedDraft, GeneratedScopeItem, GeneratedAssumption, GeneratedRisk } from "./types";

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

PREVIOUS Q&A:
${qaHistory}

Analyze the scope for:
1. **Vagueness** — requirements using fuzzy language ("a few," "simple," "basic")
2. **Missing categories** — no mention of auth, hosting, data migration, testing, deployment, etc.
3. **Implicit assumptions** — things the client probably expects but didn't say
4. **Complexity signals** — red flags like "real-time," "integrations," "legacy system"

Generate 1-3 questions, prioritized by:
- Scope impact (how much could the estimate change based on the answer?)
- Risk (how likely is this to cause a blowup?)
- Mark whether the team can answer this or it needs to go back to the client

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
