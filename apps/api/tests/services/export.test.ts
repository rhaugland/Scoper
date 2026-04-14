import { describe, it, expect } from "vitest";
import { scopeToMarkdown, scopeToQuestionList } from "../../src/services/export";

const mockState = {
  scope: { id: "s1", summary: "Build an internal dashboard", version: 1 },
  scopeItems: [
    { phase: "Setup", deliverable: "Project scaffold", optimisticHours: 4, likelyHours: 8, pessimisticHours: 12, confidence: 80 },
    { phase: "Core", deliverable: "Dashboard charts", optimisticHours: 16, likelyHours: 24, pessimisticHours: 40, confidence: 60 },
  ],
  assumptions: [
    { id: "a1", content: "Web only, no mobile", status: "accepted" },
    { id: "a2", content: "No SSO required", status: "unresolved" },
  ],
  risks: [
    { id: "r1", content: "Chart library may not support all chart types", severity: "medium", mitigation: "Evaluate in setup phase" },
  ],
  questions: [
    { id: "q1", content: "Do you need role-based access?", answer: "Yes, admin and viewer roles", forClient: false, skipped: false },
    { id: "q2", content: "What's the expected data volume?", answer: null, forClient: true, skipped: false },
  ],
};

describe("scopeToMarkdown", () => {
  it("includes project summary", () => {
    const md = scopeToMarkdown(mockState as any, "Test Project", "Acme Corp");
    expect(md).toContain("Test Project");
    expect(md).toContain("Acme Corp");
    expect(md).toContain("Build an internal dashboard");
  });

  it("includes phases and deliverables with effort ranges", () => {
    const md = scopeToMarkdown(mockState as any, "Test", null);
    expect(md).toContain("Setup");
    expect(md).toContain("Project scaffold");
    expect(md).toContain("4");
    expect(md).toContain("8");
    expect(md).toContain("12");
  });

  it("includes assumptions with status", () => {
    const md = scopeToMarkdown(mockState as any, "Test", null);
    expect(md).toContain("Web only, no mobile");
    expect(md).toContain("accepted");
  });

  it("includes risks", () => {
    const md = scopeToMarkdown(mockState as any, "Test", null);
    expect(md).toContain("Chart library");
    expect(md).toContain("medium");
  });
});

describe("scopeToQuestionList", () => {
  it("only includes unanswered client-facing questions", () => {
    const list = scopeToQuestionList(mockState as any);
    expect(list).toContain("What's the expected data volume?");
    expect(list).not.toContain("Do you need role-based access?");
  });
});
