import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              questions: [
                {
                  content: "Does the dashboard need role-based access control?",
                  scopeImpact: "high",
                  riskLevel: "medium",
                  forClient: false,
                },
              ],
              updatedScopeItems: null,
              newAssumptions: [],
              newRisks: [],
            }),
          },
        ],
      }),
    };
  },
}));

import { interrogateScope } from "../../src/services/ai/interrogate";

describe("interrogateScope", () => {
  it("returns questions based on current scope state", async () => {
    const result = await interrogateScope(
      {
        projectType: "web app",
        summary: "Internal dashboard",
        statedRequirements: ["Dashboard with charts"],
        impliedRequirements: ["Hosting"],
        stakeholders: ["John"],
        constraints: [],
        timelineReferences: [],
      },
      [
        {
          phase: "Setup",
          deliverable: "Scaffold",
          optimisticHours: 4,
          likelyHours: 8,
          pessimisticHours: 12,
          confidence: 80,
        },
      ],
      [{ content: "Web only" }],
      [{ content: "Chart library risk", severity: "low", mitigation: null }],
      []
    );

    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.questions[0].content).toContain("role-based");
    expect(result.questions[0].scopeImpact).toBe("high");
  });
});
