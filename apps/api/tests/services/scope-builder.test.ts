import { describe, it, expect, vi } from "vitest";

// Mock all dependencies
vi.mock("@scoper/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  scopes: {}, scopeItems: {}, assumptions: {}, risks: {}, questions: {}, inputs: {}, projects: {},
}));
vi.mock("../../src/services/ai/extract", () => ({ extractFromInputs: vi.fn() }));
vi.mock("../../src/services/ai/interrogate", () => ({ interrogateScope: vi.fn() }));

import { startScopingSession, answerQuestion, getCurrentScopeState } from "../../src/services/scope-builder";

describe("scope-builder", () => {
  it("exports startScopingSession function", () => {
    expect(typeof startScopingSession).toBe("function");
  });
  it("exports answerQuestion function", () => {
    expect(typeof answerQuestion).toBe("function");
  });
  it("exports getCurrentScopeState function", () => {
    expect(typeof getCurrentScopeState).toBe("function");
  });
});
