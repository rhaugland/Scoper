interface ScopeState {
  scope: { summary: string | null; version: number };
  scopeItems: {
    phase: string;
    deliverable: string;
    optimisticHours: number;
    likelyHours: number;
    pessimisticHours: number;
    confidence: number;
  }[];
  assumptions: { content: string; status: string }[];
  risks: { content: string; severity: string; mitigation: string | null }[];
  questions: { content: string; answer: string | null; forClient: boolean; skipped: boolean }[];
}

export function scopeToMarkdown(
  state: ScopeState,
  projectName: string,
  clientName: string | null
): string {
  const lines: string[] = [];

  lines.push(`# ${projectName} — Scope`);
  if (clientName) lines.push(`**Client:** ${clientName}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push(state.scope.summary ?? "No summary available.");
  lines.push("");

  const phases = new Map<string, typeof state.scopeItems>();
  for (const item of state.scopeItems) {
    const existing = phases.get(item.phase) ?? [];
    existing.push(item);
    phases.set(item.phase, existing);
  }

  lines.push("## Scope");
  lines.push("");

  let totalOptimistic = 0;
  let totalLikely = 0;
  let totalPessimistic = 0;

  for (const [phase, items] of phases) {
    lines.push(`### ${phase}`);
    lines.push("");
    lines.push("| Deliverable | Optimistic | Likely | Pessimistic | Confidence |");
    lines.push("|---|---|---|---|---|");
    for (const item of items) {
      lines.push(
        `| ${item.deliverable} | ${item.optimisticHours}h | ${item.likelyHours}h | ${item.pessimisticHours}h | ${item.confidence}% |`
      );
      totalOptimistic += item.optimisticHours;
      totalLikely += item.likelyHours;
      totalPessimistic += item.pessimisticHours;
    }
    lines.push("");
  }

  lines.push(`**Total effort:** ${totalOptimistic}h (optimistic) / ${totalLikely}h (likely) / ${totalPessimistic}h (pessimistic)`);
  lines.push("");

  lines.push("## Assumptions");
  lines.push("");
  for (const a of state.assumptions) {
    lines.push(`- ${a.content} *(${a.status})*`);
  }
  lines.push("");

  lines.push("## Risks");
  lines.push("");
  for (const r of state.risks) {
    lines.push(`- **[${r.severity}]** ${r.content}${r.mitigation ? ` — Mitigation: ${r.mitigation}` : ""}`);
  }
  lines.push("");

  const openQuestions = state.questions.filter((q) => !q.answer && !q.skipped);
  if (openQuestions.length > 0) {
    lines.push("## Open Questions");
    lines.push("");
    for (const q of openQuestions) {
      lines.push(`- ${q.content}${q.forClient ? " *(for client)*" : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function scopeToQuestionList(state: ScopeState): string {
  const clientQuestions = state.questions.filter(
    (q) => q.forClient && !q.answer && !q.skipped
  );

  if (clientQuestions.length === 0) {
    return "No outstanding questions for the client.";
  }

  const lines = [
    "Hi,",
    "",
    "We're working through the scope for this project and have a few questions we'd like to clarify:",
    "",
  ];

  for (let i = 0; i < clientQuestions.length; i++) {
    lines.push(`${i + 1}. ${clientQuestions[i].content}`);
  }

  lines.push("");
  lines.push("Let us know when you get a chance — these will help us finalize the scope and estimate.");
  lines.push("");
  lines.push("Thanks!");

  return lines.join("\n");
}
