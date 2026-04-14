import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              draft: {
                projectType: "web app",
                summary: "Client wants an internal dashboard",
                statedRequirements: ["Dashboard with charts", "User login"],
                impliedRequirements: ["Hosting", "Database"],
                stakeholders: ["John (PM)"],
                constraints: ["Launch by Q3"],
                timelineReferences: ["Q3 2026"],
              },
              scopeItems: [
                {
                  phase: "Setup",
                  deliverable: "Project scaffold and CI",
                  optimisticHours: 4,
                  likelyHours: 8,
                  pessimisticHours: 12,
                  confidence: 80,
                },
              ],
              assumptions: [{ content: "Web-only, no mobile" }],
              risks: [
                {
                  content: "Chart library choice could affect timeline",
                  severity: "low",
                  mitigation: "Evaluate libraries in setup phase",
                },
              ],
            }),
          },
        ],
      }),
    };
  },
}));

import { extractFromInputs } from "../../src/services/ai/extract";

describe("extractFromInputs", () => {
  it("returns structured extraction from raw inputs", async () => {
    const result = await extractFromInputs([
      "Client wants an internal dashboard with charts. John is the PM. Need it by Q3.",
    ]);

    expect(result.draft.projectType).toBe("web app");
    expect(result.draft.statedRequirements).toContain("Dashboard with charts");
    expect(result.scopeItems.length).toBeGreaterThan(0);
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.risks.length).toBeGreaterThan(0);
  });
});
