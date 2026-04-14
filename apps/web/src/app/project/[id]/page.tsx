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
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"input" | "scoping" | "complete" | "delivered">("input");
  const [summary, setSummary] = useState("");
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
  const [editingDeliverable, setEditingDeliverable] = useState<string | null>(null);
  const [editDeliverableName, setEditDeliverableName] = useState("");
  const [addingItemToPhase, setAddingItemToPhase] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ deliverable: "", optimistic: 0, likely: 0, pessimistic: 0 });
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
          setQuestions(state.questions);
          setSummary(state.draft?.summary ?? "");
          if (p.status === "delivered") {
            setPhase("delivered");
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

  async function handleSaveHours(itemId: string) {
    await updateScopeItem(itemId, {
      optimisticHours: editHours.optimistic,
      likelyHours: editHours.likely,
      pessimisticHours: editHours.pessimistic,
    });
    setScopeItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, optimisticHours: editHours.optimistic, likelyHours: editHours.likely, pessimisticHours: editHours.pessimistic }
          : item
      )
    );
    setEditingItemId(null);
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
    <div className="min-h-screen bg-cream">
      <div className="border-b border-sand bg-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="text-gray-500 hover:text-forest">
            &larr;
          </button>
          <h1 className="font-bold text-forest">{project.name}</h1>
          {project.clientName && <span className="text-gray-500">— {project.clientName}</span>}
        </div>
        {phase !== "input" && (
          <div className="flex gap-2">
            <button onClick={handleExportMarkdown} className="text-sm px-3 py-1 border border-sand rounded hover:bg-sand/50 transition">
              Export scope
            </button>
            <button onClick={handleExportQuestions} className="text-sm px-3 py-1 border border-sand rounded hover:bg-sand/50 transition">
              Copy client questions
            </button>
          </div>
        )}
      </div>

      {phase === "input" ? (
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-gray-600 mb-6">
            Paste your raw client input — call notes, emails, transcripts. Add as many as you have, then start scoping.
          </p>

          {inputs.length > 0 && (
            <div className="mb-6 space-y-2">
              {inputs.map((input, i) => (
                <div key={input.id} className="p-3 bg-white rounded-lg border border-sand">
                  <div className="text-xs text-gray-500 mb-1">Input {i + 1} — {input.source}</div>
                  <p className="text-sm text-gray-700 line-clamp-3">{input.content}</p>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddInput} className="space-y-3 mb-6">
            <select
              value={inputSource}
              onChange={(e) => setInputSource(e.target.value)}
              className="px-3 py-2 rounded border border-sand bg-white text-sm"
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
              className="w-full px-4 py-3 rounded-lg border border-sand bg-white focus:outline-none focus:ring-2 focus:ring-forest resize-y font-mono text-sm"
            />
            <button type="submit" className="px-4 py-2 bg-white border border-sand rounded-lg hover:bg-sand/50 transition">
              Add input
            </button>
          </form>

          <button
            onClick={handleStartScoping}
            disabled={inputs.length === 0 || loading}
            className="w-full px-4 py-3 bg-forest text-white rounded-lg font-medium hover:bg-forest-light transition disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Start scoping"}
          </button>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-57px)]">
          {/* Left: Chat */}
          <div className="w-1/2 border-r border-sand flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-forest/10 rounded-lg p-4">
                <div className="text-xs text-forest font-medium mb-1">Draft Summary</div>
                <p className="text-sm text-gray-800">{summary}</p>
              </div>

              {phase === "scoping" && questions.some((q) => !q.answer && !q.skipped) && (
                <button
                  onClick={handleAnswerAllAndFinish}
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50"
                >
                  {loading ? "Finishing up..." : "Answer all & finish"}
                </button>
              )}

              {[...questions].sort((a, b) => {
                const aAnswered = a.answer || a.skipped ? 1 : 0;
                const bAnswered = b.answer || b.skipped ? 1 : 0;
                return bAnswered - aAnswered;
              }).map((q) => {
                const isActive = activeQuestionId === q.id;
                const isUnanswered = !q.answer && !q.skipped;

                return (
                  <div key={q.id} className="space-y-2">
                    <div
                      className={`rounded-lg p-4 border transition ${
                        isActive
                          ? "bg-white border-forest ring-1 ring-forest/30"
                          : isUnanswered
                          ? "bg-white border-sand cursor-pointer hover:border-forest/30"
                          : "bg-white border-sand"
                      }`}
                      onClick={() => {
                        if (isUnanswered && !loading) {
                          setActiveQuestionId(isActive ? null : q.id);
                          setCurrentAnswer("");
                          setTimeout(() => answerInputRef.current?.focus(), 50);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          q.scopeImpact === "high" ? "bg-red-100 text-red-700" :
                          q.scopeImpact === "medium" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {q.scopeImpact} impact
                        </span>
                        {q.forClient && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">for client</span>
                        )}
                        {isUnanswered && !isActive && (
                          <span className="ml-auto text-xs text-gray-400">click to answer</span>
                        )}
                      </div>
                      <p className="text-sm">{q.content}</p>

                      {/* Inline answer input */}
                      {isActive && phase === "scoping" && (
                        <div className="mt-3 pt-3 border-t border-sand/50" onClick={(e) => e.stopPropagation()}>
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
                            placeholder="Type your answer... (Enter to send, Shift+Enter for newline)"
                            disabled={loading}
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg border border-sand bg-cream/50 focus:outline-none focus:ring-2 focus:ring-forest text-sm resize-none"
                          />
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-400">Your answer refines the scope in real time</span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setCurrentAnswer(generateDummyAnswer(q.content));
                                }}
                                disabled={loading}
                                className="px-3 py-1.5 text-xs text-purple-600 hover:text-purple-800 transition"
                              >
                                Fill dummy
                              </button>
                              <button
                                onClick={async () => {
                                  await handleAnswer(q.id, undefined, true);
                                  setActiveQuestionId(null);
                                }}
                                disabled={loading}
                                className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700 transition"
                              >
                                Skip — ask client
                              </button>
                              <button
                                onClick={() => {
                                  handleAnswer(q.id, currentAnswer);
                                  setActiveQuestionId(null);
                                }}
                                disabled={!currentAnswer.trim() || loading}
                                className="px-4 py-1.5 bg-forest text-white rounded text-xs hover:bg-forest-light transition disabled:opacity-50"
                              >
                                {loading ? "Updating scope..." : "Submit"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {q.answer && (
                      <div className="ml-8 bg-forest/5 rounded-lg p-3">
                        <p className="text-sm text-gray-700">{q.answer}</p>
                      </div>
                    )}
                    {q.skipped && (
                      <div className="ml-8 text-xs text-gray-400 italic">Skipped — flagged for client</div>
                    )}
                  </div>
                );
              })}

              {phase === "complete" && (
                <div className="bg-forest/10 rounded-lg p-4 text-center">
                  <p className="text-forest font-medium">Scope is solid.</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Export your scope or copy client questions above.
                  </p>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Right: Scope view */}
          <div className="w-1/2 overflow-y-auto p-4 bg-white">
            <h2 className="font-bold text-forest mb-4">Scope</h2>

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

            {Array.from(phases).map(([phaseName, items]) => {
              const phaseOptimistic = items.reduce((s, i) => s + i.optimisticHours, 0);
              const phaseLikely = items.reduce((s, i) => s + i.likelyHours, 0);
              const phasePessimistic = items.reduce((s, i) => s + i.pessimisticHours, 0);

              return (
                <div key={phaseName} className="mb-6">
                  <div className="flex items-center justify-between mb-2 group">
                    {editingPhase === phaseName ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          value={editPhaseName}
                          onChange={(e) => setEditPhaseName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRenamePhase(phaseName); if (e.key === "Escape") setEditingPhase(null); }}
                          autoFocus
                          className="font-medium text-gray-900 px-2 py-0.5 border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest flex-1"
                        />
                        <button onClick={() => handleRenamePhase(phaseName)} className="text-xs text-forest font-medium">Save</button>
                        <button onClick={() => setEditingPhase(null)} className="text-xs text-gray-400">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <h3
                          className="font-medium text-gray-900 cursor-pointer hover:text-forest transition"
                          onClick={() => { setEditingPhase(phaseName); setEditPhaseName(phaseName); }}
                          title="Click to rename phase"
                        >
                          {phaseName}
                        </h3>
                        <button
                          onClick={() => setAddingItemToPhase(phaseName)}
                          className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-forest transition-opacity"
                        >
                          + Add item
                        </button>
                      </>
                    )}
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <div key={item.id}>
                        <div className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-cream/50 group">
                          {editingDeliverable === item.id ? (
                            <div className="flex items-center gap-2 flex-1 mr-2">
                              <input
                                value={editDeliverableName}
                                onChange={(e) => setEditDeliverableName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveDeliverable(item.id); if (e.key === "Escape") setEditingDeliverable(null); }}
                                autoFocus
                                className="text-sm text-gray-700 px-2 py-0.5 border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest flex-1"
                              />
                              <button onClick={() => handleSaveDeliverable(item.id)} className="text-xs text-forest font-medium">Save</button>
                              <button onClick={() => setEditingDeliverable(null)} className="text-xs text-gray-400">Cancel</button>
                            </div>
                          ) : (
                            <span
                              className="text-gray-700 cursor-pointer hover:text-forest transition"
                              onClick={() => { setEditingDeliverable(item.id); setEditDeliverableName(item.deliverable); }}
                              title="Click to edit"
                            >
                              {item.deliverable}
                            </span>
                          )}
                          <div className="flex items-center gap-2 text-xs text-gray-500 flex-shrink-0">
                            <span>{item.optimisticHours} — {item.likelyHours} — {item.pessimisticHours}h</span>
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-forest rounded-full"
                                style={{ width: `${item.confidence}%` }}
                              />
                            </div>
                            <button
                              onClick={() => {
                                setEditingItemId(item.id);
                                setEditHours({
                                  optimistic: item.optimisticHours,
                                  likely: item.likelyHours,
                                  pessimistic: item.pessimisticHours,
                                });
                              }}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-forest transition-opacity ml-1"
                              title="Edit hours"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.2 10.326a1 1 0 0 0-.26.46l-.667 2.666a.5.5 0 0 0 .607.607l2.666-.667a1 1 0 0 0 .46-.26l7.813-7.813a1.75 1.75 0 0 0 0-2.475l-.331-.33Z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteScopeItem(item.id)}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
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
                          <div className="mx-2 mb-2 p-3 bg-cream/50 rounded-lg border border-sand/50">
                            <div className="grid grid-cols-3 gap-3 mb-3">
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">Optimistic</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={editHours.optimistic}
                                  onChange={(e) => setEditHours({ ...editHours, optimistic: parseInt(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">Likely</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={editHours.likely}
                                  onChange={(e) => setEditHours({ ...editHours, likely: parseInt(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">Pessimistic</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={editHours.pessimistic}
                                  onChange={(e) => setEditHours({ ...editHours, pessimistic: parseInt(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setEditingItemId(null)}
                                className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 transition"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveHours(item.id)}
                                className="px-3 py-1 text-xs bg-forest text-white rounded hover:bg-forest-light transition"
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
                      <div className="mx-2 p-3 bg-cream/50 rounded-lg border border-sand/50 space-y-2">
                        <input
                          value={newItem.deliverable}
                          onChange={(e) => setNewItem({ ...newItem, deliverable: e.target.value })}
                          placeholder="Deliverable name..."
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter" && newItem.deliverable.trim()) handleAddScopeItem(phaseName); if (e.key === "Escape") setAddingItemToPhase(null); }}
                          className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                        />
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Optimistic hrs</label>
                            <input type="number" min={0} value={newItem.optimistic || ""} onChange={(e) => setNewItem({ ...newItem, optimistic: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Likely hrs</label>
                            <input type="number" min={0} value={newItem.likely || ""} onChange={(e) => setNewItem({ ...newItem, likely: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Pessimistic hrs</label>
                            <input type="number" min={0} value={newItem.pessimistic || ""} onChange={(e) => setNewItem({ ...newItem, pessimistic: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest" />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setAddingItemToPhase(null); setNewItem({ deliverable: "", optimistic: 0, likely: 0, pessimistic: 0 }); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          <button onClick={() => handleAddScopeItem(phaseName)} disabled={!newItem.deliverable.trim()} className="text-xs text-forest font-medium disabled:opacity-50">Add</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-2 px-2 pt-1 border-t border-sand/30">
                    <span className="font-medium">{phaseName} subtotal</span>
                    <span>
                      {phaseOptimistic} — {phaseLikely} — {phasePessimistic}h
                      {rateConfig.blendedRate > 0 && (
                        <span className="ml-2 text-forest">{calcPrice(phaseOptimistic)} — {calcPrice(phaseLikely)} — {calcPrice(phasePessimistic)}</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}

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

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">Assumptions</h3>
                <button
                  onClick={() => setAddingAssumption(true)}
                  className="text-xs text-gray-400 hover:text-forest transition"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-1">
                {assumptions.map((a) => (
                  <div key={a.id}>
                    {editingAssumptionId === a.id ? (
                      <div className="p-2 bg-cream/50 rounded-lg border border-sand/50 space-y-2">
                        <input
                          value={editAssumption.content}
                          onChange={(e) => setEditAssumption({ ...editAssumption, content: e.target.value })}
                          className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={editAssumption.status}
                            onChange={(e) => setEditAssumption({ ...editAssumption, status: e.target.value })}
                            className="px-2 py-1 text-xs border border-sand rounded bg-white"
                          >
                            <option value="unresolved">Unresolved</option>
                            <option value="accepted">Accepted</option>
                            <option value="rejected">Rejected</option>
                          </select>
                          <div className="flex-1" />
                          <button onClick={() => handleDeleteAssumption(a.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                          <button onClick={() => setEditingAssumptionId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          <button onClick={() => handleSaveAssumption(a.id)} className="text-xs text-forest font-medium">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex items-center gap-2 text-sm py-1 group cursor-pointer hover:bg-cream/30 rounded px-1"
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
                        <span className="text-gray-700 flex-1">{a.content}</span>
                        <span className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 transition-opacity">edit</span>
                      </div>
                    )}
                  </div>
                ))}
                {addingAssumption && (
                  <div className="p-2 bg-cream/50 rounded-lg border border-sand/50 space-y-2">
                    <input
                      value={newAssumption}
                      onChange={(e) => setNewAssumption(e.target.value)}
                      placeholder="New assumption..."
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter" && newAssumption.trim()) handleAddAssumption(); }}
                      className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setAddingAssumption(false); setNewAssumption(""); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      <button onClick={handleAddAssumption} disabled={!newAssumption.trim()} className="text-xs text-forest font-medium disabled:opacity-50">Add</button>
                    </div>
                  </div>
                )}
                {assumptions.length === 0 && !addingAssumption && (
                  <div className="text-sm text-gray-400 italic">No assumptions yet</div>
                )}
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">Risks</h3>
                <button
                  onClick={() => setAddingRisk(true)}
                  className="text-xs text-gray-400 hover:text-forest transition"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-1">
                {risks.map((r) => (
                  <div key={r.id}>
                    {editingRiskId === r.id ? (
                      <div className="p-2 bg-cream/50 rounded-lg border border-sand/50 space-y-2">
                        <input
                          value={editRisk.content}
                          onChange={(e) => setEditRisk({ ...editRisk, content: e.target.value })}
                          placeholder="Risk description..."
                          className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                        />
                        <div className="flex gap-2">
                          <select
                            value={editRisk.severity}
                            onChange={(e) => setEditRisk({ ...editRisk, severity: e.target.value })}
                            className="px-2 py-1 text-xs border border-sand rounded bg-white"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                          <input
                            value={editRisk.mitigation}
                            onChange={(e) => setEditRisk({ ...editRisk, mitigation: e.target.value })}
                            placeholder="Mitigation (optional)"
                            className="flex-1 px-2 py-1 text-xs border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1" />
                          <button onClick={() => handleDeleteRisk(r.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                          <button onClick={() => setEditingRiskId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          <button onClick={() => handleSaveRisk(r.id)} className="text-xs text-forest font-medium">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="text-sm py-1 group cursor-pointer hover:bg-cream/30 rounded px-1 flex items-center"
                        onClick={() => {
                          setEditingRiskId(r.id);
                          setEditRisk({ content: r.content, severity: r.severity, mitigation: r.mitigation ?? "" });
                        }}
                      >
                        <span className={`text-xs font-medium mr-2 flex-shrink-0 ${
                          r.severity === "high" ? "text-red-600" :
                          r.severity === "medium" ? "text-yellow-600" :
                          "text-gray-500"
                        }`}>
                          {r.severity.toUpperCase()}
                        </span>
                        <span className="text-gray-700 flex-1">{r.content}</span>
                        <span className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 transition-opacity ml-2">edit</span>
                      </div>
                    )}
                  </div>
                ))}
                {addingRisk && (
                  <div className="p-2 bg-cream/50 rounded-lg border border-sand/50 space-y-2">
                    <input
                      value={newRisk.content}
                      onChange={(e) => setNewRisk({ ...newRisk, content: e.target.value })}
                      placeholder="Risk description..."
                      autoFocus
                      className="w-full px-2 py-1 text-sm border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newRisk.severity}
                        onChange={(e) => setNewRisk({ ...newRisk, severity: e.target.value })}
                        className="px-2 py-1 text-xs border border-sand rounded bg-white"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <input
                        value={newRisk.mitigation}
                        onChange={(e) => setNewRisk({ ...newRisk, mitigation: e.target.value })}
                        placeholder="Mitigation (optional)"
                        className="flex-1 px-2 py-1 text-xs border border-sand rounded bg-white focus:outline-none focus:ring-1 focus:ring-forest"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setAddingRisk(false); setNewRisk({ content: "", severity: "medium", mitigation: "" }); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      <button onClick={handleAddRisk} disabled={!newRisk.content.trim()} className="text-xs text-forest font-medium disabled:opacity-50">Add</button>
                    </div>
                  </div>
                )}
                {risks.length === 0 && !addingRisk && (
                  <div className="text-sm text-gray-400 italic">No risks flagged yet</div>
                )}
              </div>
            </div>

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
          </div>
        </div>
      )}
    </div>
  );
}
