"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getProject,
  listInputs,
  addInput,
  startScoping,
  getScopeState,
  listScopes,
  answerQuestion as apiAnswerQuestion,
  completeScope,
  updateScopeItem,
  addScopeItem,
  deleteScopeItem,
  renamePhase,
  exportMarkdown,
  exportQuestions,
  updateProject,
  generateProposal,
  addAssumption as apiAddAssumption,
  updateAssumption as apiUpdateAssumption,
  deleteAssumption as apiDeleteAssumption,
  addRisk as apiAddRisk,
  updateRisk as apiUpdateRisk,
  deleteRisk as apiDeleteRisk,
  logActual,
  updateActual,
  getAccuracyReport,
} from "@/lib/api";

interface Question {
  id: string;
  content: string;
  answer: string | null;
  skipped: boolean;
  scopeImpact: string;
  riskLevel: string;
  forClient: boolean;
}

interface ScopeItem {
  id: string;
  phase: string;
  deliverable: string;
  optimisticHours: number;
  likelyHours: number;
  pessimisticHours: number;
  confidence: number;
}

interface Assumption {
  id: string;
  content: string;
  status: string;
}

interface Risk {
  id: string;
  content: string;
  severity: string;
  mitigation: string | null;
}

interface ActualEntry {
  id: string;
  deliverable: string;
  optimisticHours: number;
  likelyHours: number;
  pessimisticHours: number;
  actualHours: number | null;
  actualId: string | null;
  variancePercent: number | null;
  notes: string | null;
}

interface PhaseReport {
  phase: string;
  items: ActualEntry[];
  totals: { estimatedLikely: number; actual: number | null; variancePercent: number | null };
}

interface AccuracyReport {
  phases: PhaseReport[];
  project: { totalEstimated: number; totalActual: number | null; variancePercent: number | null; accuracyScore: number | null };
}

function generateDummyAnswer(question: string): string {
  const q = question.toLowerCase();

  if (q.includes("how many") || q.includes("number of") || q.includes("volume"))
    return "Small scale to start — roughly 10-50 users, standard volume. We can scale later if needed.";
  if (q.includes("timeline") || q.includes("deadline") || q.includes("when") || q.includes("launch"))
    return "No hard deadline. Target is 6-8 weeks for MVP, but flexibility is fine.";
  if (q.includes("budget") || q.includes("cost") || q.includes("pricing"))
    return "Mid-range budget. Not trying to gold-plate it, but don't want to cut corners on core functionality.";
  if (q.includes("auth") || q.includes("login") || q.includes("user") || q.includes("permission") || q.includes("role"))
    return "Simple email/password auth. One admin role and one regular user role. No SSO or OAuth needed for now.";
  if (q.includes("integrat") || q.includes("third-party") || q.includes("api") || q.includes("external"))
    return "No third-party integrations needed for MVP. Everything self-contained for now.";
  if (q.includes("mobile") || q.includes("responsive") || q.includes("device"))
    return "Desktop-first, basic responsive is fine. No native mobile app needed.";
  if (q.includes("data") || q.includes("migrat") || q.includes("existing") || q.includes("legacy"))
    return "Starting fresh — no data migration. Clean slate.";
  if (q.includes("hosting") || q.includes("deploy") || q.includes("infrastructure"))
    return "Standard cloud hosting is fine. Nothing special needed for infrastructure.";
  if (q.includes("security") || q.includes("compliance") || q.includes("hipaa") || q.includes("gdpr"))
    return "Standard security best practices. No special compliance requirements.";
  if (q.includes("design") || q.includes("brand") || q.includes("ui") || q.includes("look"))
    return "Clean and professional. No existing brand guidelines to follow — designer will handle visuals.";

  return "Standard approach is fine for this. Use reasonable defaults and keep it simple for the MVP.";
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [project, setProject] = useState<any>(null);
  const [inputText, setInputText] = useState("");
  const [inputSource, setInputSource] = useState("call_notes");
  const [inputs, setInputs] = useState<any[]>([]);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [assumptions, setAssumptions] = useState<Assumption[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  // TODO: Remove sample questions once real data flows through
  const sampleQuestions: Question[] = [
    { id: "sample-1", content: "What authentication method should be used — OAuth, SSO, or email/password?", answer: null, skipped: false, scopeImpact: "high", riskLevel: "high", forClient: false },
    { id: "sample-2", content: "Is there an existing brand guide or design system we should follow?", answer: "Yes, they have a Figma design system. Will share access.", skipped: false, scopeImpact: "medium", riskLevel: "low", forClient: false },
    { id: "sample-3", content: "What is the expected number of concurrent users at launch?", answer: null, skipped: true, scopeImpact: "high", riskLevel: "medium", forClient: true },
  ];
  const [questions, setQuestions] = useState<Question[]>(sampleQuestions);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"input" | "scoping" | "complete" | "delivered">("scoping");
  const [summary, setSummary] = useState("Client needs a customer portal with dashboards, user management, and reporting. Timeline is 8 weeks. Integration with existing Salesforce CRM is required.");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState({ optimistic: 0, likely: 0, pessimistic: 0 });
  const [rateConfig, setRateConfig] = useState({ blendedRate: 0, marginPercent: 0, weeklyCapacity: 30 });
  const [editingRate, setEditingRate] = useState(false);
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [proposalPricingMode, setProposalPricingMode] = useState<"per_phase" | "retainer">("per_phase");
  const [retainerMonths, setRetainerMonths] = useState(3);
  const [showProposalOptions, setShowProposalOptions] = useState(false);
  const [editingAssumptionId, setEditingAssumptionId] = useState<string | null>(null);
  const [editAssumption, setEditAssumption] = useState({ content: "", status: "unresolved" });
  const [addingAssumption, setAddingAssumption] = useState(false);
  const [newAssumption, setNewAssumption] = useState("");
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null);
  const [editRisk, setEditRisk] = useState({ content: "", severity: "medium", mitigation: "" });
  const [addingRisk, setAddingRisk] = useState(false);
  const [newRisk, setNewRisk] = useState({ content: "", severity: "medium", mitigation: "" });
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [editPhaseName, setEditPhaseName] = useState("");
  const [editingPhaseHours, setEditingPhaseHours] = useState<string | null>(null);
  const [editingDeliverable, setEditingDeliverable] = useState<string | null>(null);
  const [editDeliverableName, setEditDeliverableName] = useState("");
  const [addingItemToPhase, setAddingItemToPhase] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ deliverable: "", optimistic: 0, likely: 0, pessimistic: 0 });
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [scopeOpen, setScopeOpen] = useState(true);
  const [assumptionsOpen, setAssumptionsOpen] = useState(true);
  const [risksOpen, setRisksOpen] = useState(true);
  const [report, setReport] = useState<AccuracyReport | null>(null);
  const [editingActualItemId, setEditingActualItemId] = useState<string | null>(null);
  const [editActualHours, setEditActualHours] = useState(0);
  const [editActualNotes, setEditActualNotes] = useState("");
  const [showNotes, setShowNotes] = useState<Set<string>>(new Set());
  const answerInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getProject(projectId).then(async (p) => {
      setProject(p);
      setRateConfig({
        blendedRate: p.blendedRate ?? 0,
        marginPercent: p.marginPercent ?? 0,
        weeklyCapacity: p.weeklyCapacity ?? 30,
      });
      // Restore phase from server status
      if (p.status === "delivered" || p.status === "complete" || p.status === "scoping") {
        const scopeList = await listScopes(projectId);
        if (scopeList.length > 0) {
          const activeScope = scopeList[0];
          setScopeId(activeScope.id);
          const state = await getScopeState(activeScope.id);
          setScopeItems(state.scopeItems);
          setAssumptions(state.assumptions);
          setRisks(state.risks);
          setQuestions(state.questions.length > 0 ? state.questions : sampleQuestions);
          setSummary(state.draft?.summary || "Client needs a customer portal with dashboards, user management, and reporting. Timeline is 8 weeks. Integration with existing Salesforce CRM is required.");
          if (p.status === "delivered") {
            setPhase("delivered");
            const r = await getAccuracyReport(projectId);
            setReport(r);
          } else if (p.status === "complete") {
            setPhase("complete");
          } else {
            setPhase("scoping");
          }
        }
      }
    }).catch(() => router.push("/dashboard"));
    listInputs(projectId).then(setInputs);
  }, [projectId, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [questions]);

  async function handleAddInput(e: React.FormEvent) {
    e.preventDefault();
    if (!inputText.trim()) return;
    const input = await addInput(projectId, inputText, inputSource);
    setInputs([...inputs, input]);
    setInputText("");
  }

  async function handleStartScoping() {
    if (inputs.length === 0) return;
    setLoading(true);
    try {
      const result = await startScoping(projectId);
      setScopeId(result.scopeId);
      setSummary(result.draft.summary);
      setPhase("scoping");

      const state = await getScopeState(result.scopeId);
      setScopeItems(state.scopeItems);
      setAssumptions(state.assumptions);
      setRisks(state.risks);
      setQuestions(state.questions);
    } finally {
      setLoading(false);
    }
  }

  async function handleAnswer(questionId: string, answer?: string, skipped?: boolean) {
    setLoading(true);
    try {
      const result = await apiAnswerQuestion(questionId, answer, skipped);

      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId ? { ...q, answer: answer ?? null, skipped: skipped ?? false } : q
        )
      );

      if (result.scopeComplete) {
        setPhase("complete");
      }

      if (scopeId) {
        const state = await getScopeState(scopeId);
        setScopeItems(state.scopeItems);
        setAssumptions(state.assumptions);
        setRisks(state.risks);
        const existingIds = new Set(questions.map((q) => q.id));
        const newQuestions = state.questions.filter((q: Question) => !existingIds.has(q.id));
        if (newQuestions.length > 0) {
          setQuestions((prev) => [
            ...prev.map((q) =>
              q.id === questionId ? { ...q, answer: answer ?? null, skipped: skipped ?? false } : q
            ),
            ...newQuestions,
          ]);
        }
      }
    } finally {
      setLoading(false);
      setCurrentAnswer("");
    }
  }

  async function handleSaveHours(itemId: string, hours?: { optimistic: number; likely: number; pessimistic: number }) {
    const h = hours ?? editHours;
    await updateScopeItem(itemId, {
      optimisticHours: h.optimistic,
      likelyHours: h.likely,
      pessimisticHours: h.pessimistic,
    });
    setScopeItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, optimisticHours: h.optimistic, likelyHours: h.likely, pessimisticHours: h.pessimistic }
          : item
      )
    );
    if (!hours) setEditingItemId(null);
  }

  async function handleRenamePhase(oldName: string) {
    if (!editPhaseName.trim() || editPhaseName === oldName || !scopeId) return;
    await renamePhase(scopeId, oldName, editPhaseName);
    setScopeItems((prev) => prev.map((item) => item.phase === oldName ? { ...item, phase: editPhaseName } : item));
    setEditingPhase(null);
  }

  async function handleSaveDeliverable(itemId: string) {
    if (!editDeliverableName.trim()) return;
    await updateScopeItem(itemId, { deliverable: editDeliverableName });
    setScopeItems((prev) => prev.map((item) => item.id === itemId ? { ...item, deliverable: editDeliverableName } : item));
    setEditingDeliverable(null);
  }

  async function handleAddScopeItem(phaseName: string) {
    if (!newItem.deliverable.trim() || !scopeId) return;
    const created = await addScopeItem(scopeId, phaseName, newItem.deliverable, {
      optimistic: newItem.optimistic,
      likely: newItem.likely,
      pessimistic: newItem.pessimistic,
    });
    setScopeItems((prev) => [...prev, { id: created.id, phase: phaseName, deliverable: newItem.deliverable, optimisticHours: newItem.optimistic, likelyHours: newItem.likely, pessimisticHours: newItem.pessimistic, confidence: 50 }]);
    setNewItem({ deliverable: "", optimistic: 0, likely: 0, pessimistic: 0 });
    setAddingItemToPhase(null);
  }

  async function handleDeleteScopeItem(itemId: string) {
    await deleteScopeItem(itemId);
    setScopeItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  async function handleMarkDelivered() {
    await updateProject(projectId, { status: "delivered" });
    setProject((prev: any) => ({ ...prev, status: "delivered" }));
    setPhase("delivered");
    const r = await getAccuracyReport(projectId);
    setReport(r);
  }

  async function handleLogActual(scopeItemId: string) {
    if (editActualHours <= 0) return;
    try {
      await logActual(scopeItemId, editActualHours, editActualNotes || undefined);
      const r = await getAccuracyReport(projectId);
      setReport(r);
      setEditingActualItemId(null);
      setEditActualHours(0);
      setEditActualNotes("");
    } catch (e: any) {
      if (e.message?.includes("already logged")) {
        const item = report?.phases.flatMap((p) => p.items).find((i) => i.id === scopeItemId);
        if (item?.actualId) {
          await updateActual(item.actualId, { actualHours: editActualHours, notes: editActualNotes || undefined });
          const r = await getAccuracyReport(projectId);
          setReport(r);
          setEditingActualItemId(null);
          setEditActualHours(0);
          setEditActualNotes("");
        }
      }
    }
  }

  function varianceColor(variance: number | null): string {
    if (variance === null) return "";
    const abs = Math.abs(variance);
    if (abs <= 10) return "text-green-600";
    if (abs <= 30) return "text-yellow-600";
    return "text-red-600";
  }

  function varianceBgColor(variance: number | null): string {
    if (variance === null) return "bg-surface";
    const abs = Math.abs(variance);
    if (abs <= 10) return "bg-green-100";
    if (abs <= 30) return "bg-yellow-100";
    return "bg-red-100";
  }

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

  function calcPrice(hours: number): string {
    if (!rateConfig.blendedRate) return "";
    const rate = rateConfig.blendedRate * (1 + (rateConfig.marginPercent || 0) / 100);
    return `$${((hours * rate) / 100).toLocaleString()}`;
  }

  // Assumption handlers
  async function handleSaveAssumption(id: string) {
    await apiUpdateAssumption(id, editAssumption);
    setAssumptions((prev) => prev.map((a) => a.id === id ? { ...a, ...editAssumption } : a));
    setEditingAssumptionId(null);
  }
  async function handleAddAssumption() {
    if (!newAssumption.trim() || !scopeId) return;
    const created = await apiAddAssumption(scopeId, newAssumption, "unresolved");
    setAssumptions((prev) => [...prev, created]);
    setNewAssumption("");
    setAddingAssumption(false);
  }
  async function handleDeleteAssumption(id: string) {
    await apiDeleteAssumption(id);
    setAssumptions((prev) => prev.filter((a) => a.id !== id));
  }

  // Risk handlers
  async function handleSaveRisk(id: string) {
    await apiUpdateRisk(id, editRisk);
    setRisks((prev) => prev.map((r) => r.id === id ? { ...r, content: editRisk.content, severity: editRisk.severity, mitigation: editRisk.mitigation || null } : r));
    setEditingRiskId(null);
  }
  async function handleAddRisk() {
    if (!newRisk.content.trim() || !scopeId) return;
    const created = await apiAddRisk(scopeId, newRisk.content, newRisk.severity, newRisk.mitigation || undefined);
    setRisks((prev) => [...prev, created]);
    setNewRisk({ content: "", severity: "medium", mitigation: "" });
    setAddingRisk(false);
  }
  async function handleDeleteRisk(id: string) {
    await apiDeleteRisk(id);
    setRisks((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleAnswerAllAndFinish() {
    if (!scopeId) return;
    setLoading(true);
    try {
      const unanswered = questions.filter((q) => !q.answer && !q.skipped);
      const answers = unanswered.map((q) => ({
        questionId: q.id,
        answer: generateDummyAnswer(q.content),
      }));

      await completeScope(scopeId, answers);

      // Update local state
      setQuestions((prev) =>
        prev.map((q) => {
          const filled = answers.find((a) => a.questionId === q.id);
          if (filled) return { ...q, answer: filled.answer, skipped: false };
          return q;
        })
      );

      // Refresh scope data
      const state = await getScopeState(scopeId);
      setScopeItems(state.scopeItems);
      setAssumptions(state.assumptions);
      setRisks(state.risks);

      setPhase("complete");
    } finally {
      setLoading(false);
    }
  }

  async function handleExportMarkdown() {
    try {
      const md = await exportMarkdown(projectId);
      const blob = new Blob([md], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name ?? "scope"}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
    }
  }

  async function handleExportQuestions() {
    const text = await exportQuestions(projectId);
    navigator.clipboard.writeText(text);
  }

  const phases = new Map<string, ScopeItem[]>();
  for (const item of scopeItems) {
    const existing = phases.get(item.phase) ?? [];
    existing.push(item);
    phases.set(item.phase, existing);
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-navy">
      <div className="border-b border-border bg-surface px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="text-dim hover:text-accent-blue">
            &larr;
          </button>
          <h1 className="font-black bg-gradient-to-br from-accent-red to-accent-blue bg-clip-text text-transparent">{project.name}</h1>
          {project.clientName && <span className="text-dim">— {project.clientName}</span>}
        </div>
      </div>

      {phase === "input" ? (
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-muted mb-6">
            Paste your raw client input — call notes, emails, transcripts. Add as many as you have, then start scoping.
          </p>

          {inputs.length > 0 && (
            <div className="mb-6 space-y-2">
              {inputs.map((input, i) => (
                <div key={input.id} className="p-3 bg-surface rounded-lg border border-border">
                  <div className="text-xs text-dim mb-1">Input {i + 1} — {input.source}</div>
                  <p className="text-sm text-slate-300 line-clamp-3">{input.content}</p>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddInput} className="space-y-3 mb-6">
            <select
              value={inputSource}
              onChange={(e) => setInputSource(e.target.value)}
              className="px-3 py-2 rounded border border-border bg-surface text-sm"
            >
              <option value="call_notes">Call notes</option>
              <option value="email">Email</option>
              <option value="transcript">Transcript</option>
              <option value="other">Other</option>
            </select>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste raw client input here..."
              rows={8}
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-accent-blue resize-y font-mono text-sm"
            />
            <button type="submit" className="px-4 py-2 bg-surface border border-border rounded-lg hover:bg-surface/50 transition">
              Add input
            </button>
          </form>

          <button
            onClick={handleStartScoping}
            disabled={inputs.length === 0 || loading}
            className="w-full px-4 py-3 bg-gradient-to-br from-accent-red to-accent-blue text-white rounded-lg font-bold hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Start scoping"}
          </button>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-57px)]">
          {/* Left: Chat */}
          <div className={`${leftPanelOpen ? "w-1/2" : "w-0"} border-r border-border/50 flex flex-col transition-all duration-300 overflow-hidden`}>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Draft Summary */}
              <div>
                <h3 className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">Draft Summary</h3>
                <div className="bg-surface rounded-lg border border-border p-4">
                  <p className="text-sm text-slate-200 leading-relaxed">{summary}</p>
                </div>
              </div>

              {/* AI Suggested Questions */}
              {questions.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-faint uppercase tracking-wide">AI Suggested Questions</h3>
                    <span className="text-xs text-faint">
                      {questions.filter((q) => q.answer || q.skipped).length}/{questions.length} answered
                    </span>
                  </div>

                  {phase === "scoping" && questions.some((q) => !q.answer && !q.skipped) && (
                    <button
                      onClick={handleAnswerAllAndFinish}
                      disabled={loading}
                      className="w-full px-4 py-2 mb-4 bg-accent-blue text-white rounded-lg text-sm font-medium hover:bg-accent-blue/80 transition disabled:opacity-50"
                    >
                      {loading ? "Finishing up..." : "Skip remaining & finish"}
                    </button>
                  )}

                  <div className="space-y-3">
                    {[...questions].sort((a, b) => {
                      const aAnswered = a.answer || a.skipped ? 1 : 0;
                      const bAnswered = b.answer || b.skipped ? 1 : 0;
                      return aAnswered - bAnswered;
                    }).map((q) => {
                      const isActive = activeQuestionId === q.id;
                      const isAnswered = !!q.answer;
                      const isSkipped = !!q.skipped;

                      return (
                        <div key={q.id} className={`rounded-lg border p-4 transition ${isAnswered ? "bg-accent-blue/5 border-accent-blue/20" : isSkipped ? "bg-surface/50 border-border" : "bg-surface border-border"}`}>
                          <div className="flex items-start gap-2 mb-2">
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${isAnswered ? "bg-accent-blue" : isSkipped ? "bg-dim" : "bg-yellow-400"}`} />
                            <p className="text-sm text-slate-200">{q.content}</p>
                          </div>

                          {q.forClient && (
                            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 ml-3.5 mb-2">Ask client</span>
                          )}

                          {isAnswered && (
                            <div className="ml-3.5 mt-1 text-sm text-muted italic">{q.answer}</div>
                          )}

                          {isSkipped && (
                            <div className="ml-3.5 mt-1 text-xs text-faint italic">Skipped — flagged for client</div>
                          )}

                          {!isAnswered && !isSkipped && phase === "scoping" && (
                            <div className="ml-3.5 mt-2">
                              {isActive ? (
                                <div onClick={(e) => e.stopPropagation()}>
                                  <textarea
                                    ref={answerInputRef}
                                    value={currentAnswer}
                                    onChange={(e) => setCurrentAnswer(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && !e.shiftKey && currentAnswer.trim()) {
                                        e.preventDefault();
                                        handleAnswer(q.id, currentAnswer);
                                        setActiveQuestionId(null);
                                      }
                                    }}
                                    placeholder="Type your answer..."
                                    disabled={loading}
                                    rows={2}
                                    className="w-full px-3 py-2 rounded border border-border bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue text-sm resize-none"
                                  />
                                  <div className="flex items-center justify-end gap-2 mt-2">
                                    <button
                                      onClick={async () => {
                                        await handleAnswer(q.id, undefined, true);
                                        setActiveQuestionId(null);
                                      }}
                                      disabled={loading}
                                      className="px-3 py-1 text-xs text-faint hover:text-muted transition"
                                    >
                                      Skip
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleAnswer(q.id, currentAnswer);
                                        setActiveQuestionId(null);
                                      }}
                                      disabled={!currentAnswer.trim() || loading}
                                      className="px-3 py-1 bg-accent-blue text-white rounded text-xs hover:bg-accent-blue/80 transition disabled:opacity-50"
                                    >
                                      {loading ? "Saving..." : "Submit"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  readOnly
                                  placeholder="Click to answer..."
                                  className="w-full px-3 py-2 rounded border border-border bg-navy/30 text-sm text-faint cursor-pointer hover:border-accent-blue/30 transition"
                                  onClick={() => {
                                    setActiveQuestionId(q.id);
                                    setCurrentAnswer("");
                                    setTimeout(() => answerInputRef.current?.focus(), 50);
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {phase === "complete" && (
                <div className="bg-accent-blue/5 rounded-lg p-4 text-center border border-accent-blue/20">
                  <p className="text-accent-blue font-medium">Scoping complete</p>
                  <p className="text-sm text-muted mt-1">
                    Review your scope, assumptions, and risks on the right.
                  </p>
                </div>
              )}

              {phase === "delivered" && (
                <div className="bg-surface/50 rounded-lg p-4 text-center border border-border">
                  <p className="font-medium text-slate-200">Project Delivered</p>
                  <p className="text-sm text-muted mt-1">
                    Log actual hours per deliverable to track estimate accuracy.
                  </p>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Right: Scope view */}
          <div className={`${leftPanelOpen ? "w-1/2" : "flex-1"} overflow-y-auto p-4 bg-surface transition-all duration-300`}>
            <div className="flex items-center gap-3 mb-1">
              <button
                onClick={() => setLeftPanelOpen(!leftPanelOpen)}
                className="text-faint hover:text-accent-blue transition"
                title={leftPanelOpen ? "Expand scope view" : "Show questions"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  {leftPanelOpen ? (
                    <path fillRule="evenodd" d="M15 10a.75.75 0 01-.75.75H7.612l2.158 1.96a.75.75 0 11-1.04 1.08l-3.5-3.25a.75.75 0 010-1.08l3.5-3.25a.75.75 0 111.04 1.08L7.612 9.25h6.638A.75.75 0 0115 10z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M5 10a.75.75 0 01.75-.75h6.638L10.23 7.29a.75.75 0 111.04-1.08l3.5 3.25a.75.75 0 010 1.08l-3.5 3.25a.75.75 0 11-1.04-1.08l2.158-1.96H5.75A.75.75 0 015 10z" clipRule="evenodd" />
                  )}
                </svg>
              </button>
            </div>

            {/* Scope Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => setScopeOpen(!scopeOpen)}
                  className="flex items-center gap-2 text-left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-faint transition-transform ${scopeOpen ? "rotate-90" : ""}`}>
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                  <h2 className="font-extrabold text-slate-100">Scope</h2>
                  <span className="text-xs text-faint">({scopeItems.length} items)</span>
                </button>
                <button
                  onClick={() => { setScopeOpen(true); setAddingItemToPhase(Array.from(phases.keys())[0] ?? "New Phase"); }}
                  className="text-xs text-faint hover:text-accent-blue transition"
                >
                  + Add item
                </button>
              </div>
              {scopeOpen && (
                <p className="text-xs text-faint mb-4 ml-6">Click phase names, deliverables, or hour estimates to edit</p>
              )}
            </div>

            {scopeOpen && (<>
            {Array.from(phases).map(([phaseName, items]) => {
              const phaseOptimistic = items.reduce((s, i) => s + i.optimisticHours, 0);
              const phaseLikely = items.reduce((s, i) => s + i.likelyHours, 0);
              const phasePessimistic = items.reduce((s, i) => s + i.pessimisticHours, 0);

              return (
                <div key={phaseName} className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    {editingPhase === phaseName ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          value={editPhaseName}
                          onChange={(e) => setEditPhaseName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRenamePhase(phaseName); if (e.key === "Escape") setEditingPhase(null); }}
                          autoFocus
                          className="font-medium text-slate-100 px-2 py-0.5 border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue flex-1"
                        />
                        <button onClick={() => handleRenamePhase(phaseName)} className="text-xs text-accent-blue font-medium">Save</button>
                        <button onClick={() => setEditingPhase(null)} className="text-xs text-faint">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <h3
                          className="font-medium text-slate-100 cursor-pointer hover:text-accent-blue transition"
                          onClick={() => { setEditingPhase(phaseName); setEditPhaseName(phaseName); }}
                          title="Click to rename phase"
                        >
                          {phaseName}
                        </h3>
                        <span
                          className="text-xs text-dim cursor-pointer hover:text-accent-blue transition"
                          onClick={() => setEditingPhaseHours(editingPhaseHours === phaseName ? null : phaseName)}
                          title="Click to edit hours"
                        >
                          {phaseOptimistic} — {phaseLikely} — {phasePessimistic}h
                        </span>
                      </>
                    )}
                  </div>
                  {editingPhaseHours === phaseName && (
                    <div className="mb-3 p-3 bg-navy/50 rounded-lg border border-border/50 space-y-3">
                      {items.map((item) => (
                        <div key={item.id}>
                          <div className="text-xs text-muted mb-1">{item.deliverable}</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] text-faint block">Optimistic</label>
                              <input
                                type="number"
                                min={0}
                                defaultValue={item.optimisticHours}
                                onBlur={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  if (val !== item.optimisticHours) handleSaveHours(item.id, { optimistic: val, likely: item.likelyHours, pessimistic: item.pessimisticHours });
                                }}
                                className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-faint block">Likely</label>
                              <input
                                type="number"
                                min={0}
                                defaultValue={item.likelyHours}
                                onBlur={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  if (val !== item.likelyHours) handleSaveHours(item.id, { optimistic: item.optimisticHours, likely: val, pessimistic: item.pessimisticHours });
                                }}
                                className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-faint block">Pessimistic</label>
                              <input
                                type="number"
                                min={0}
                                defaultValue={item.pessimisticHours}
                                onBlur={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  if (val !== item.pessimisticHours) handleSaveHours(item.id, { optimistic: item.optimisticHours, likely: item.likelyHours, pessimistic: val });
                                }}
                                className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-end">
                        <button
                          onClick={() => setEditingPhaseHours(null)}
                          className="text-xs text-dim hover:text-slate-300 transition"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    {items.map((item) => (
                      <div key={item.id}>
                        <div className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-surface/50 group">
                          {editingDeliverable === item.id ? (
                            <div className="flex items-center gap-2 flex-1 mr-2">
                              <input
                                value={editDeliverableName}
                                onChange={(e) => setEditDeliverableName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveDeliverable(item.id); if (e.key === "Escape") setEditingDeliverable(null); }}
                                autoFocus
                                className="text-sm text-slate-300 px-2 py-0.5 border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue flex-1"
                              />
                              <button onClick={() => handleSaveDeliverable(item.id)} className="text-xs text-accent-blue font-medium">Save</button>
                              <button onClick={() => setEditingDeliverable(null)} className="text-xs text-faint">Cancel</button>
                            </div>
                          ) : (
                            <span
                              className="text-slate-300 cursor-pointer hover:text-accent-blue transition"
                              onClick={() => { setEditingDeliverable(item.id); setEditDeliverableName(item.deliverable); }}
                              title="Click to edit"
                            >
                              {item.deliverable}
                            </span>
                          )}
                          <div className="flex items-center gap-2 text-xs text-dim flex-shrink-0">
                            <button
                              onClick={() => {
                                setEditingItemId(item.id);
                                setEditHours({
                                  optimistic: item.optimisticHours,
                                  likely: item.likelyHours,
                                  pessimistic: item.pessimisticHours,
                                });
                              }}
                              className="opacity-0 group-hover:opacity-100 text-faint hover:text-accent-blue transition-opacity ml-1"
                              title="Edit hours"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.2 10.326a1 1 0 0 0-.26.46l-.667 2.666a.5.5 0 0 0 .607.607l2.666-.667a1 1 0 0 0 .46-.26l7.813-7.813a1.75 1.75 0 0 0 0-2.475l-.331-.33Z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteScopeItem(item.id)}
                              className="opacity-0 group-hover:opacity-100 text-faint hover:text-red-500 transition-opacity"
                              title="Delete item"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Inline edit for hours */}
                        {editingItemId === item.id && (
                          <div className="mx-2 mb-2 p-3 bg-navy/50 rounded-lg border border-border/50">
                            <div className="grid grid-cols-3 gap-3 mb-3">
                              <div>
                                <label className="text-xs text-dim block mb-1">Optimistic</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={editHours.optimistic}
                                  onChange={(e) => setEditHours({ ...editHours, optimistic: parseInt(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-dim block mb-1">Likely</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={editHours.likely}
                                  onChange={(e) => setEditHours({ ...editHours, likely: parseInt(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-dim block mb-1">Pessimistic</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={editHours.pessimistic}
                                  onChange={(e) => setEditHours({ ...editHours, pessimistic: parseInt(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setEditingItemId(null)}
                                className="px-3 py-1 text-xs text-dim hover:text-slate-300 transition"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveHours(item.id)}
                                className="px-3 py-1 text-xs bg-accent-blue text-white rounded hover:bg-accent-blue/80 transition"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add new item to phase */}
                    {addingItemToPhase === phaseName && (
                      <div className="mx-2 p-3 bg-navy/50 rounded-lg border border-border/50 space-y-2">
                        <input
                          value={newItem.deliverable}
                          onChange={(e) => setNewItem({ ...newItem, deliverable: e.target.value })}
                          placeholder="Deliverable name..."
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter" && newItem.deliverable.trim()) handleAddScopeItem(phaseName); if (e.key === "Escape") setAddingItemToPhase(null); }}
                          className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                        />
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs text-dim block mb-1">Optimistic hrs</label>
                            <input type="number" min={0} value={newItem.optimistic || ""} onChange={(e) => setNewItem({ ...newItem, optimistic: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue" />
                          </div>
                          <div>
                            <label className="text-xs text-dim block mb-1">Likely hrs</label>
                            <input type="number" min={0} value={newItem.likely || ""} onChange={(e) => setNewItem({ ...newItem, likely: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue" />
                          </div>
                          <div>
                            <label className="text-xs text-dim block mb-1">Pessimistic hrs</label>
                            <input type="number" min={0} value={newItem.pessimistic || ""} onChange={(e) => setNewItem({ ...newItem, pessimistic: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue" />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setAddingItemToPhase(null); setNewItem({ deliverable: "", optimistic: 0, likely: 0, pessimistic: 0 }); }} className="text-xs text-faint hover:text-muted">Cancel</button>
                          <button onClick={() => handleAddScopeItem(phaseName)} disabled={!newItem.deliverable.trim()} className="text-xs text-accent-blue font-medium disabled:opacity-50">Add</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-dim mt-2 px-2 pt-1 border-t border-border/30">
                    <span className="font-medium">{phaseName} subtotal</span>
                    <span>
                      {phaseOptimistic} — {phaseLikely} — {phasePessimistic}h
                      {rateConfig.blendedRate > 0 && (
                        <span className="ml-2 text-accent-blue">{calcPrice(phaseOptimistic)} — {calcPrice(phaseLikely)} — {calcPrice(phasePessimistic)}</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Rate Config */}
            <div className="mb-6 p-3 bg-navy/30 rounded-lg border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-dim uppercase tracking-wide">Rate Config</h3>
                {!editingRate ? (
                  <button
                    onClick={() => setEditingRate(true)}
                    className="text-xs text-faint hover:text-accent-blue transition"
                  >
                    {rateConfig.blendedRate ? "Edit" : "Set rate"}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setEditingRate(false)} className="text-xs text-faint hover:text-muted">Cancel</button>
                    <button onClick={handleSaveRate} className="text-xs text-accent-blue hover:text-accent-blue/80 font-medium">Save</button>
                  </div>
                )}
              </div>
              {editingRate ? (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-dim block mb-1">Rate ($/hr)</label>
                    <input
                      type="number"
                      min={0}
                      value={rateConfig.blendedRate / 100 || ""}
                      onChange={(e) => setRateConfig({ ...rateConfig, blendedRate: Math.round(parseFloat(e.target.value || "0") * 100) })}
                      className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                      placeholder="150"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-dim block mb-1">Margin %</label>
                    <input
                      type="number"
                      min={0}
                      value={rateConfig.marginPercent || ""}
                      onChange={(e) => setRateConfig({ ...rateConfig, marginPercent: parseInt(e.target.value || "0") })}
                      className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-dim block mb-1">Hrs/week</label>
                    <input
                      type="number"
                      min={1}
                      value={rateConfig.weeklyCapacity}
                      onChange={(e) => setRateConfig({ ...rateConfig, weeklyCapacity: parseInt(e.target.value || "30") })}
                      className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                      placeholder="30"
                    />
                  </div>
                </div>
              ) : rateConfig.blendedRate ? (
                <div className="text-sm text-muted">
                  ${(rateConfig.blendedRate / 100).toFixed(0)}/hr
                  {rateConfig.marginPercent ? ` + ${rateConfig.marginPercent}% margin` : ""}
                  {" · "}{rateConfig.weeklyCapacity}hrs/week
                </div>
              ) : (
                <div className="text-sm text-faint italic">No rate set — set to see pricing</div>
              )}
            </div>

            {scopeItems.length > 0 && (
              <div className="border-t-2 border-accent-blue/20 pt-4 mb-6">
                <div className="flex justify-between text-sm font-medium mb-1">
                  <span>Total estimate</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-dim mb-1">Optimistic</div>
                    <div className="text-lg font-semibold text-accent-blue">
                      {scopeItems.reduce((s, i) => s + i.optimisticHours, 0)}h
                    </div>
                    {rateConfig.blendedRate > 0 && (
                      <div className="text-sm text-muted">
                        {calcPrice(scopeItems.reduce((s, i) => s + i.optimisticHours, 0))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-dim mb-1">Realistic</div>
                    <div className="text-lg font-semibold text-accent-blue">
                      {scopeItems.reduce((s, i) => s + i.likelyHours, 0)}h
                    </div>
                    {rateConfig.blendedRate > 0 && (
                      <div className="text-sm text-muted">
                        {calcPrice(scopeItems.reduce((s, i) => s + i.likelyHours, 0))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-dim mb-1">Pessimistic</div>
                    <div className="text-lg font-semibold text-accent-blue">
                      {scopeItems.reduce((s, i) => s + i.pessimisticHours, 0)}h
                    </div>
                    {rateConfig.blendedRate > 0 && (
                      <div className="text-sm text-muted">
                        {calcPrice(scopeItems.reduce((s, i) => s + i.pessimisticHours, 0))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            </>)}

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setAssumptionsOpen(!assumptionsOpen)}
                  className="flex items-center gap-2 text-left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-faint transition-transform ${assumptionsOpen ? "rotate-90" : ""}`}>
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                  <h2 className="font-extrabold text-slate-100">Assumptions</h2>
                  <span className="text-xs text-faint">({assumptions.length})</span>
                </button>
                <button
                  onClick={() => { setAssumptionsOpen(true); setAddingAssumption(true); }}
                  className="text-xs text-faint hover:text-accent-blue transition"
                >
                  + Add
                </button>
              </div>
              {assumptionsOpen && (<>
              <p className="text-xs text-faint mb-2 ml-6">Click to edit</p>
              <div className="space-y-1">
                {assumptions.map((a) => (
                  <div key={a.id}>
                    {editingAssumptionId === a.id ? (
                      <div className="p-2 bg-navy/50 rounded-lg border border-border/50 space-y-2">
                        <input
                          value={editAssumption.content}
                          onChange={(e) => setEditAssumption({ ...editAssumption, content: e.target.value })}
                          className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={editAssumption.status}
                            onChange={(e) => setEditAssumption({ ...editAssumption, status: e.target.value })}
                            className="px-2 py-1 text-xs border border-border rounded bg-surface"
                          >
                            <option value="unresolved">Unresolved</option>
                            <option value="accepted">Accepted</option>
                            <option value="rejected">Rejected</option>
                          </select>
                          <div className="flex-1" />
                          <button onClick={() => handleDeleteAssumption(a.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                          <button onClick={() => setEditingAssumptionId(null)} className="text-xs text-faint hover:text-muted">Cancel</button>
                          <button onClick={() => handleSaveAssumption(a.id)} className="text-xs text-accent-blue font-medium">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex items-center gap-2 text-sm py-1.5 px-2 group cursor-pointer hover:bg-surface/50 rounded"
                        onClick={() => {
                          setEditingAssumptionId(a.id);
                          setEditAssumption({ content: a.content, status: a.status });
                        }}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          a.status === "accepted" ? "bg-green-500" :
                          a.status === "rejected" ? "bg-red-500" :
                          "bg-yellow-500"
                        }`} />
                        <span className="text-slate-300 flex-1">{a.content}</span>
                        <span className="opacity-0 group-hover:opacity-100 text-xs text-faint transition-opacity">edit</span>
                      </div>
                    )}
                  </div>
                ))}
                {addingAssumption && (
                  <div className="p-2 bg-navy/50 rounded-lg border border-border/50 space-y-2">
                    <input
                      value={newAssumption}
                      onChange={(e) => setNewAssumption(e.target.value)}
                      placeholder="New assumption..."
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter" && newAssumption.trim()) handleAddAssumption(); }}
                      className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setAddingAssumption(false); setNewAssumption(""); }} className="text-xs text-faint hover:text-muted">Cancel</button>
                      <button onClick={handleAddAssumption} disabled={!newAssumption.trim()} className="text-xs text-accent-blue font-medium disabled:opacity-50">Add</button>
                    </div>
                  </div>
                )}
                {assumptions.length === 0 && !addingAssumption && (
                  <div className="text-sm text-faint italic">No assumptions yet</div>
                )}
              </div>
              </>)}
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setRisksOpen(!risksOpen)}
                  className="flex items-center gap-2 text-left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-faint transition-transform ${risksOpen ? "rotate-90" : ""}`}>
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                  <h2 className="font-extrabold text-slate-100">Risks</h2>
                  <span className="text-xs text-faint">({risks.length})</span>
                </button>
                <button
                  onClick={() => { setRisksOpen(true); setAddingRisk(true); }}
                  className="text-xs text-faint hover:text-accent-blue transition"
                >
                  + Add
                </button>
              </div>
              {risksOpen && (<>
              <p className="text-xs text-faint mb-2 ml-6">Click to edit</p>
              <div className="space-y-1">
                {risks.map((r) => (
                  <div key={r.id}>
                    {editingRiskId === r.id ? (
                      <div className="p-2 bg-navy/50 rounded-lg border border-border/50 space-y-2">
                        <input
                          value={editRisk.content}
                          onChange={(e) => setEditRisk({ ...editRisk, content: e.target.value })}
                          placeholder="Risk description..."
                          className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                        />
                        <div className="flex gap-2">
                          <select
                            value={editRisk.severity}
                            onChange={(e) => setEditRisk({ ...editRisk, severity: e.target.value })}
                            className="px-2 py-1 text-xs border border-border rounded bg-surface"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                          <input
                            value={editRisk.mitigation}
                            onChange={(e) => setEditRisk({ ...editRisk, mitigation: e.target.value })}
                            placeholder="Mitigation (optional)"
                            className="flex-1 px-2 py-1 text-xs border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1" />
                          <button onClick={() => handleDeleteRisk(r.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                          <button onClick={() => setEditingRiskId(null)} className="text-xs text-faint hover:text-muted">Cancel</button>
                          <button onClick={() => handleSaveRisk(r.id)} className="text-xs text-accent-blue font-medium">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="py-1.5 px-2 group cursor-pointer hover:bg-surface/50 rounded"
                        onClick={() => {
                          setEditingRiskId(r.id);
                          setEditRisk({ content: r.content, severity: r.severity, mitigation: r.mitigation ?? "" });
                        }}
                      >
                        <div className="flex items-center text-sm">
                          <span className={`text-xs font-medium mr-2 flex-shrink-0 ${
                            r.severity === "high" ? "text-red-600" :
                            r.severity === "medium" ? "text-yellow-600" :
                            "text-dim"
                          }`}>
                            {r.severity.toUpperCase()}
                          </span>
                          <span className="text-slate-300 flex-1">{r.content}</span>
                          <span className="opacity-0 group-hover:opacity-100 text-xs text-faint transition-opacity ml-2">edit</span>
                        </div>
                        {r.mitigation && (
                          <div className="ml-12 mt-1 text-xs text-dim italic">
                            Mitigation: {r.mitigation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {addingRisk && (
                  <div className="p-2 bg-navy/50 rounded-lg border border-border/50 space-y-2">
                    <input
                      value={newRisk.content}
                      onChange={(e) => setNewRisk({ ...newRisk, content: e.target.value })}
                      placeholder="Risk description..."
                      autoFocus
                      className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newRisk.severity}
                        onChange={(e) => setNewRisk({ ...newRisk, severity: e.target.value })}
                        className="px-2 py-1 text-xs border border-border rounded bg-surface"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <input
                        value={newRisk.mitigation}
                        onChange={(e) => setNewRisk({ ...newRisk, mitigation: e.target.value })}
                        placeholder="Mitigation (optional)"
                        className="flex-1 px-2 py-1 text-xs border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setAddingRisk(false); setNewRisk({ content: "", severity: "medium", mitigation: "" }); }} className="text-xs text-faint hover:text-muted">Cancel</button>
                      <button onClick={handleAddRisk} disabled={!newRisk.content.trim()} className="text-xs text-accent-blue font-medium disabled:opacity-50">Add</button>
                    </div>
                  </div>
                )}
                {risks.length === 0 && !addingRisk && (
                  <div className="text-sm text-faint italic">No risks flagged yet</div>
                )}
              </div>
              </>)}
            </div>

            {/* Generate Proposal */}
            {phase === "complete" && (
              <div className="border-t-2 border-accent-blue/20 pt-4 mt-6">
                {!showProposalOptions ? (
                  <button
                    onClick={() => setShowProposalOptions(true)}
                    disabled={!rateConfig.blendedRate}
                    className="w-full px-4 py-3 bg-gradient-to-br from-accent-red to-accent-blue text-white rounded-lg font-bold hover:opacity-90 transition disabled:opacity-50"
                  >
                    {rateConfig.blendedRate ? "Generate Proposal" : "Set rate to generate proposal"}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <h3 className="font-medium text-slate-100">Proposal Options</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setProposalPricingMode("per_phase")}
                        className={`flex-1 px-3 py-2 rounded text-sm border transition ${
                          proposalPricingMode === "per_phase"
                            ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                            : "border-border text-muted hover:border-accent-blue/30"
                        }`}
                      >
                        Per phase
                      </button>
                      <button
                        onClick={() => setProposalPricingMode("retainer")}
                        className={`flex-1 px-3 py-2 rounded text-sm border transition ${
                          proposalPricingMode === "retainer"
                            ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                            : "border-border text-muted hover:border-accent-blue/30"
                        }`}
                      >
                        Monthly retainer
                      </button>
                    </div>
                    {proposalPricingMode === "retainer" && (
                      <div>
                        <label className="text-xs text-dim block mb-1">Number of months</label>
                        <input
                          type="number"
                          min={1}
                          value={retainerMonths}
                          onChange={(e) => setRetainerMonths(parseInt(e.target.value) || 3)}
                          className="w-20 px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowProposalOptions(false)}
                        className="flex-1 px-3 py-2 text-sm text-dim hover:text-slate-300 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleGenerateProposal}
                        disabled={generatingProposal}
                        className="flex-1 px-4 py-2 bg-accent-blue text-white rounded-lg text-sm font-medium hover:bg-accent-blue/80 transition disabled:opacity-50"
                      >
                        {generatingProposal ? "Generating..." : "Download PDF"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mark as Delivered */}
            {phase === "complete" && (
              <div className="border-t border-border/30 pt-4 mt-4">
                <button
                  onClick={handleMarkDelivered}
                  className="w-full px-4 py-3 bg-surface text-white rounded-lg font-medium hover:bg-border transition"
                >
                  Mark as Delivered
                </button>
                <p className="text-xs text-faint mt-2 text-center">
                  Unlocks actuals tracking to compare estimates vs. reality
                </p>
              </div>
            )}

            {/* Actuals Tracking */}
            {phase === "delivered" && report && (
              <div>
                <h2 className="font-extrabold text-slate-100 mb-1">Actuals vs. Estimates</h2>
                <p className="text-xs text-faint mb-4">This data is being stored to calibrate AI estimates in the future.</p>

                {/* Project summary */}
                <div className="mb-6 p-4 rounded-lg border-2 border-accent-blue/20 bg-accent-blue/5">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-xs text-dim mb-1">Estimated</div>
                      <div className="text-lg font-semibold">{report.project.totalEstimated}h</div>
                    </div>
                    <div>
                      <div className="text-xs text-dim mb-1">Actual</div>
                      <div className="text-lg font-semibold">
                        {report.project.totalActual !== null ? `${report.project.totalActual}h` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-dim mb-1">Accuracy</div>
                      <div className={`text-lg font-semibold ${report.project.accuracyScore !== null ? (report.project.accuracyScore >= 70 ? "text-green-600" : report.project.accuracyScore >= 40 ? "text-yellow-600" : "text-red-600") : ""}`}>
                        {report.project.accuracyScore !== null ? `${report.project.accuracyScore}/100` : "—"}
                      </div>
                    </div>
                  </div>
                  {report.project.variancePercent !== null && (
                    <p className="text-sm text-muted text-center mt-3">
                      This project came in {Math.abs(report.project.variancePercent).toFixed(1)}% {report.project.variancePercent > 0 ? "over" : report.project.variancePercent < 0 ? "under" : "right on"} the realistic estimate
                    </p>
                  )}
                </div>

                {/* Per-phase sections */}
                {report.phases.map((phaseData) => (
                  <div key={phaseData.phase} className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-slate-100">{phaseData.phase}</h3>
                      {phaseData.totals.variancePercent !== null && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${varianceBgColor(phaseData.totals.variancePercent)} ${varianceColor(phaseData.totals.variancePercent)}`}>
                          {phaseData.totals.variancePercent > 0 ? "+" : ""}{phaseData.totals.variancePercent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {phaseData.items.map((item) => (
                        <div key={item.id}>
                          <div className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-surface/50 group">
                            <span className="text-slate-300 flex-1">{item.deliverable}</span>
                            <div className="flex items-center gap-3 text-xs text-dim">
                              <span>{item.optimisticHours} — {item.likelyHours} — {item.pessimisticHours}h</span>
                              <span className="text-border">|</span>
                              {item.actualHours !== null ? (
                                <span
                                  className={`font-medium cursor-pointer ${varianceColor(item.variancePercent)}`}
                                  onClick={() => {
                                    setEditingActualItemId(item.id);
                                    setEditActualHours(item.actualHours!);
                                    setEditActualNotes(item.notes ?? "");
                                  }}
                                  title="Click to edit"
                                >
                                  {item.actualHours}h actual ({item.variancePercent! > 0 ? "+" : ""}{item.variancePercent!.toFixed(1)}%)
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingActualItemId(item.id);
                                    setEditActualHours(item.likelyHours);
                                    setEditActualNotes("");
                                  }}
                                  className="text-accent-blue hover:text-accent-blue/80 font-medium"
                                >
                                  Log actual
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Inline actual entry/edit */}
                          {editingActualItemId === item.id && (
                            <div className="mx-2 mb-2 p-3 bg-navy/50 rounded-lg border border-border/50">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="flex-1">
                                  <label className="text-xs text-dim block mb-1">Actual hours</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={editActualHours}
                                    onChange={(e) => setEditActualHours(parseInt(e.target.value) || 0)}
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") handleLogActual(item.id); if (e.key === "Escape") setEditingActualItemId(null); }}
                                    className="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                                  />
                                </div>
                                <div className="text-xs text-faint pt-4">
                                  vs. {item.likelyHours}h estimated
                                </div>
                              </div>
                              {showNotes.has(item.id) || editActualNotes ? (
                                <div className="mb-2">
                                  <label className="text-xs text-dim block mb-1">Notes (why over/under?)</label>
                                  <input
                                    value={editActualNotes}
                                    onChange={(e) => setEditActualNotes(e.target.value)}
                                    placeholder="e.g., Extra stakeholder meetings, simpler than expected..."
                                    className="w-full px-2 py-1 text-xs border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent-blue"
                                  />
                                </div>
                              ) : (
                                <button
                                  onClick={() => setShowNotes((prev) => new Set([...prev, item.id]))}
                                  className="text-xs text-faint hover:text-accent-blue mb-2"
                                >
                                  + add note
                                </button>
                              )}
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingActualItemId(null)} className="text-xs text-faint hover:text-muted">Cancel</button>
                                <button
                                  onClick={() => handleLogActual(item.id)}
                                  disabled={editActualHours <= 0}
                                  className="text-xs text-accent-blue font-medium disabled:opacity-50"
                                >
                                  {item.actualHours !== null ? "Update" : "Save"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-dim mt-2 px-2 pt-1 border-t border-border/30">
                      <span className="font-medium">{phaseData.phase} subtotal</span>
                      <span>
                        {phaseData.totals.estimatedLikely}h est.
                        {phaseData.totals.actual !== null && (
                          <span className={`ml-2 font-medium ${varianceColor(phaseData.totals.variancePercent)}`}>
                            {phaseData.totals.actual}h actual
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
