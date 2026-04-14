import { db, scopes, scopeItems, assumptions, risks, questions, inputs, projects } from "@scoper/db";
import { eq, and, asc } from "drizzle-orm";
import { extractFromInputs } from "./ai/extract";
import { interrogateScope } from "./ai/interrogate";
import type { ExtractedDraft, GeneratedScopeItem, GeneratedAssumption, GeneratedRisk } from "./ai/types";

export async function startScopingSession(projectId: string): Promise<{
  scopeId: string;
  draft: ExtractedDraft;
  firstQuestions: { content: string; scopeImpact: string; riskLevel: string; forClient: boolean }[];
}> {
  // Fetch all inputs for this project
  const projectInputs = await db
    .select()
    .from(inputs)
    .where(eq(inputs.projectId, projectId));

  if (projectInputs.length === 0) {
    throw new Error("No inputs found for this project. Add at least one input before scoping.");
  }

  const rawTexts = projectInputs.map((i) => i.content);

  // Extract structured draft
  const extraction = await extractFromInputs(rawTexts);

  // Get or create active scope
  let [scope] = await db
    .select()
    .from(scopes)
    .where(and(eq(scopes.projectId, projectId), eq(scopes.isActive, true)));

  if (!scope) {
    [scope] = await db
      .insert(scopes)
      .values({ projectId, version: 1, summary: extraction.draft.summary })
      .returning();
  } else {
    // Clear existing scope data before re-inserting
    await db.delete(scopeItems).where(eq(scopeItems.scopeId, scope.id));
    await db.delete(assumptions).where(eq(assumptions.scopeId, scope.id));
    await db.delete(risks).where(eq(risks.scopeId, scope.id));
    await db.delete(questions).where(eq(questions.scopeId, scope.id));

    await db
      .update(scopes)
      .set({ summary: extraction.draft.summary, updatedAt: new Date() })
      .where(eq(scopes.id, scope.id));
  }

  // Store scope items
  for (let i = 0; i < extraction.scopeItems.length; i++) {
    const item = extraction.scopeItems[i];
    await db.insert(scopeItems).values({
      scopeId: scope.id,
      phase: item.phase,
      deliverable: item.deliverable,
      optimisticHours: item.optimisticHours,
      likelyHours: item.likelyHours,
      pessimisticHours: item.pessimisticHours,
      confidence: item.confidence,
      sortOrder: i,
    });
  }

  // Store assumptions
  for (const a of extraction.assumptions) {
    await db.insert(assumptions).values({
      scopeId: scope.id,
      content: a.content,
    });
  }

  // Store risks
  for (const r of extraction.risks) {
    await db.insert(risks).values({
      scopeId: scope.id,
      content: r.content,
      severity: r.severity,
      mitigation: r.mitigation,
    });
  }

  // Update project status
  await db
    .update(projects)
    .set({ status: "scoping", updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // Generate first round of questions
  const interrogation = await interrogateScope(
    extraction.draft,
    extraction.scopeItems,
    extraction.assumptions,
    extraction.risks,
    []
  );

  // Store questions
  for (let i = 0; i < interrogation.questions.length; i++) {
    const q = interrogation.questions[i];
    await db.insert(questions).values({
      scopeId: scope.id,
      content: q.content,
      scopeImpact: q.scopeImpact,
      riskLevel: q.riskLevel,
      forClient: q.forClient,
      sortOrder: i,
    });
  }

  return {
    scopeId: scope.id,
    draft: extraction.draft,
    firstQuestions: interrogation.questions,
  };
}

export async function answerQuestion(
  questionId: string,
  answer: string | null,
  skipped: boolean = false
): Promise<{
  nextQuestions: { content: string; scopeImpact: string; riskLevel: string; forClient: boolean }[];
  scopeComplete: boolean;
}> {
  // Update the question
  const [question] = await db
    .select()
    .from(questions)
    .where(eq(questions.id, questionId));

  if (!question) throw new Error("Question not found");

  await db
    .update(questions)
    .set({
      answer,
      skipped,
      answeredAt: new Date(),
    })
    .where(eq(questions.id, questionId));

  // Get current scope state
  const state = await getCurrentScopeState(question.scopeId);

  // Get all previous Q&A
  const allQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.scopeId, question.scopeId))
    .orderBy(asc(questions.sortOrder));

  const previousQA = allQuestions
    .filter((q) => q.answeredAt !== null || q.skipped)
    .map((q) => ({ question: q.content, answer: q.answer }));

  // Generate next round of questions
  const interrogation = await interrogateScope(
    state.draft,
    state.scopeItems,
    state.assumptions.map((a) => ({ content: a.content })),
    state.risks.map((r) => ({
      content: r.content,
      severity: r.severity as "low" | "medium" | "high",
      mitigation: r.mitigation,
    })),
    previousQA
  );

  // Apply scope updates if any
  if (interrogation.updatedScopeItems) {
    await db.delete(scopeItems).where(eq(scopeItems.scopeId, question.scopeId));
    for (let i = 0; i < interrogation.updatedScopeItems.length; i++) {
      const item = interrogation.updatedScopeItems[i];
      await db.insert(scopeItems).values({
        scopeId: question.scopeId,
        phase: item.phase,
        deliverable: item.deliverable,
        optimisticHours: item.optimisticHours,
        likelyHours: item.likelyHours,
        pessimisticHours: item.pessimisticHours,
        confidence: item.confidence,
        sortOrder: i,
      });
    }
  }

  // Store new assumptions and risks
  for (const a of interrogation.newAssumptions) {
    await db.insert(assumptions).values({ scopeId: question.scopeId, content: a.content });
  }
  for (const r of interrogation.newRisks) {
    await db.insert(risks).values({
      scopeId: question.scopeId,
      content: r.content,
      severity: r.severity,
      mitigation: r.mitigation,
    });
  }

  // Store new questions
  const maxOrder = allQuestions.length;
  for (let i = 0; i < interrogation.questions.length; i++) {
    const q = interrogation.questions[i];
    await db.insert(questions).values({
      scopeId: question.scopeId,
      content: q.content,
      scopeImpact: q.scopeImpact,
      riskLevel: q.riskLevel,
      forClient: q.forClient,
      sortOrder: maxOrder + i,
    });
  }

  const scopeComplete = interrogation.questions.length === 0;

  if (scopeComplete) {
    const [scope] = await db.select().from(scopes).where(eq(scopes.id, question.scopeId));
    if (scope) {
      await db
        .update(projects)
        .set({ status: "complete", updatedAt: new Date() })
        .where(eq(projects.id, scope.projectId));
    }
  }

  return {
    nextQuestions: interrogation.questions,
    scopeComplete,
  };
}

export async function getCurrentScopeState(scopeId: string) {
  const [scope] = await db.select().from(scopes).where(eq(scopes.id, scopeId));
  const items = await db
    .select()
    .from(scopeItems)
    .where(eq(scopeItems.scopeId, scopeId))
    .orderBy(asc(scopeItems.sortOrder));
  const assumptionRows = await db
    .select()
    .from(assumptions)
    .where(eq(assumptions.scopeId, scopeId));
  const riskRows = await db
    .select()
    .from(risks)
    .where(eq(risks.scopeId, scopeId));
  const questionRows = await db
    .select()
    .from(questions)
    .where(eq(questions.scopeId, scopeId))
    .orderBy(asc(questions.sortOrder));

  const draft: ExtractedDraft = {
    projectType: null,
    summary: scope?.summary ?? "",
    statedRequirements: [],
    impliedRequirements: [],
    stakeholders: [],
    constraints: [],
    timelineReferences: [],
  };

  return {
    scope,
    draft,
    scopeItems: items.map((i) => ({
      id: i.id,
      phase: i.phase,
      deliverable: i.deliverable,
      optimisticHours: i.optimisticHours ?? 0,
      likelyHours: i.likelyHours ?? 0,
      pessimisticHours: i.pessimisticHours ?? 0,
      confidence: i.confidence ?? 50,
    })),
    assumptions: assumptionRows,
    risks: riskRows,
    questions: questionRows,
  };
}
