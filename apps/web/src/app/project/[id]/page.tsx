"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getProject,
  listInputs,
  addInput,
  startScoping,
  getScopeState,
  answerQuestion as apiAnswerQuestion,
  exportMarkdown,
  exportQuestions,
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
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"input" | "scoping" | "complete">("input");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    getProject(projectId).then(setProject).catch(() => router.push("/dashboard"));
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

  async function handleExportMarkdown() {
    const md = await exportMarkdown(projectId);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name ?? "scope"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportQuestions() {
    const text = await exportQuestions(projectId);
    navigator.clipboard.writeText(text);
  }

  const currentQuestion = questions.find((q) => !q.answer && !q.skipped);

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

              {questions.map((q) => (
                <div key={q.id} className="space-y-2">
                  <div className="bg-white rounded-lg p-4 border border-sand">
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
                    </div>
                    <p className="text-sm">{q.content}</p>
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
              ))}

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

            {currentQuestion && phase === "scoping" && (
              <div className="border-t border-sand p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={currentAnswer}
                    onChange={(e) => setCurrentAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && currentAnswer.trim()) {
                        handleAnswer(currentQuestion.id, currentAnswer);
                      }
                    }}
                    placeholder="Type your answer..."
                    disabled={loading}
                    className="flex-1 px-3 py-2 rounded-lg border border-sand focus:outline-none focus:ring-2 focus:ring-forest text-sm"
                  />
                  <button
                    onClick={() => handleAnswer(currentQuestion.id, currentAnswer)}
                    disabled={!currentAnswer.trim() || loading}
                    className="px-4 py-2 bg-forest text-white rounded-lg text-sm hover:bg-forest-light transition disabled:opacity-50"
                  >
                    {loading ? "..." : "Send"}
                  </button>
                  <button
                    onClick={() => handleAnswer(currentQuestion.id, undefined, true)}
                    disabled={loading}
                    className="px-3 py-2 text-gray-500 text-sm hover:text-gray-700"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Scope view */}
          <div className="w-1/2 overflow-y-auto p-4 bg-white">
            <h2 className="font-bold text-forest mb-4">Scope</h2>

            {Array.from(phases).map(([phaseName, items]) => (
              <div key={phaseName} className="mb-6">
                <h3 className="font-medium text-gray-900 mb-2">{phaseName}</h3>
                <div className="space-y-1">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-cream/50">
                      <span className="text-gray-700">{item.deliverable}</span>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{item.optimisticHours}-{item.pessimisticHours}h</span>
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-forest rounded-full"
                            style={{ width: `${item.confidence}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {scopeItems.length > 0 && (
              <div className="border-t border-sand pt-3 mb-6">
                <div className="flex justify-between text-sm font-medium">
                  <span>Total estimate</span>
                  <span className="text-forest">
                    {scopeItems.reduce((s, i) => s + i.optimisticHours, 0)}h —{" "}
                    {scopeItems.reduce((s, i) => s + i.pessimisticHours, 0)}h
                  </span>
                </div>
              </div>
            )}

            {assumptions.length > 0 && (
              <div className="mb-6">
                <h3 className="font-medium text-gray-900 mb-2">Assumptions</h3>
                <div className="space-y-1">
                  {assumptions.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm py-1">
                      <span className={`w-2 h-2 rounded-full ${
                        a.status === "accepted" ? "bg-green-500" :
                        a.status === "rejected" ? "bg-red-500" :
                        "bg-yellow-500"
                      }`} />
                      <span className="text-gray-700">{a.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {risks.length > 0 && (
              <div className="mb-6">
                <h3 className="font-medium text-gray-900 mb-2">Risks</h3>
                <div className="space-y-1">
                  {risks.map((r) => (
                    <div key={r.id} className="text-sm py-1">
                      <span className={`text-xs font-medium mr-2 ${
                        r.severity === "high" ? "text-red-600" :
                        r.severity === "medium" ? "text-yellow-600" :
                        "text-gray-500"
                      }`}>
                        {r.severity.toUpperCase()}
                      </span>
                      <span className="text-gray-700">{r.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
